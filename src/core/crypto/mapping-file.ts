/**
 * Export et import chiffrés de la table de correspondance (T4.5).
 *
 * Primitives : WebCrypto uniquement (PBKDF2-SHA-256 puis AES-256-GCM), aucune
 * dépendance. Format JSON versionné :
 *
 *   { format: "lessive-mapping", v: 1, kdf: "PBKDF2-SHA-256", iterations,
 *     salt, cipher: "AES-256-GCM", iv, ciphertext }   (binaires en base64)
 *
 * Sel (16 octets) et IV (12 octets) sont tirés au hasard à chaque export.
 * L'en-tête (format, v, kdf, iterations, cipher) est sérialisé de façon
 * canonique et passé en données authentifiées additionnelles (AAD) : le
 * modifier fait échouer le déchiffrement. Sel et IV sont liés par
 * construction (ils déterminent la clé et le tag).
 *
 * La phrase de passe n'est jamais conservée ni citée dans une erreur.
 */
import { SNAPSHOT_FORMAT, validateSnapshot } from "../mapping/snapshot.ts";
import type { SessionSnapshot } from "../mapping/snapshot.ts";
import { CryptoFormatError } from "./errors.ts";

export const MAPPING_FORMAT = "lessive-mapping";
export const MAPPING_VERSION = 1;
export const KDF_NAME = "PBKDF2-SHA-256";
export const CIPHER_NAME = "AES-256-GCM";
export const DEFAULT_ITERATIONS = 600_000;
export const MIN_ITERATIONS = 100_000;
export const MAX_ITERATIONS = 5_000_000;
export const MIN_PASSPHRASE_LENGTH = 12;
const SALT_BYTES = 16;
const IV_BYTES = 12;

const FILE_KEYS: ReadonlySet<string> = new Set([
  "format",
  "v",
  "kdf",
  "iterations",
  "salt",
  "cipher",
  "iv",
  "ciphertext",
]);

const MSG_UNSUPPORTED = "Format non pris en charge.";
const MSG_AUTH = "Phrase de passe incorrecte ou fichier altéré.";
const MSG_MALFORMED = "Fichier de correspondance illisible ou incomplet.";

// Types dérivés de `globalThis.crypto` : src/core est vérifié sans lib DOM (R3).
type Subtle = (typeof globalThis.crypto)["subtle"];
type AesKey = Awaited<ReturnType<Subtle["importKey"]>>;

function subtle(): Subtle {
  const s = (globalThis as { crypto?: { subtle?: Subtle } }).crypto?.subtle;
  if (!s) {
    throw new CryptoFormatError(
      "unavailable",
      "WebCrypto n'est pas disponible dans cet environnement.",
    );
  }
  return s;
}

function toBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

function fromBase64(value: unknown, expectedLength?: number): Uint8Array<ArrayBuffer> {
  if (typeof value !== "string") throw new CryptoFormatError("malformed-file", MSG_MALFORMED);
  let bin: string;
  try {
    bin = atob(value);
  } catch {
    throw new CryptoFormatError("malformed-file", MSG_MALFORMED);
  }
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  if (
    toBase64(bytes) !== value ||
    (expectedLength !== undefined && bytes.length !== expectedLength)
  ) {
    throw new CryptoFormatError("malformed-file", MSG_MALFORMED);
  }
  return bytes;
}

interface Header {
  format: string;
  v: number;
  kdf: string;
  iterations: number;
  cipher: string;
}

/** Sérialisation canonique de l'en-tête (ordre de clés fixe) : l'AAD. */
function canonicalHeader(h: Header): Uint8Array<ArrayBuffer> {
  const json = JSON.stringify({
    format: h.format,
    v: h.v,
    kdf: h.kdf,
    iterations: h.iterations,
    cipher: h.cipher,
  });
  return new TextEncoder().encode(json);
}

/** Vrai si la chaîne ne contient aucune moitié de paire de substitution isolée. */
function isWellFormed(value: string): boolean {
  const native = (value as { isWellFormed?: () => boolean }).isWellFormed;
  if (typeof native === "function") return native.call(value);
  for (let i = 0; i < value.length; i++) {
    const c = value.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const next = value.charCodeAt(i + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
      i++;
    } else if (c >= 0xdc00 && c <= 0xdfff) {
      return false;
    }
  }
  return true;
}

/**
 * Refuse une phrase mal formée (UTF-16 invalide : l'encodage UTF-8 la
 * remplacerait par U+FFFD et deux phrases distinctes donneraient la même clé),
 * normalise en NFC, puis refuse une phrase trop courte. Jamais citée.
 */
function preparePassphrase(passphrase: string): string {
  if (typeof passphrase === "string" && !isWellFormed(passphrase)) {
    throw new CryptoFormatError(
      "invalid-parameters",
      "La phrase de passe contient une séquence de caractères invalide.",
    );
  }
  const normalized = typeof passphrase === "string" ? passphrase.normalize("NFC") : "";
  if ([...normalized].length < MIN_PASSPHRASE_LENGTH) {
    throw new CryptoFormatError(
      "passphrase-too-short",
      `La phrase de passe est trop courte : ${MIN_PASSPHRASE_LENGTH} caractères au minimum.`,
    );
  }
  return normalized;
}

async function deriveKey(
  passphrase: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number,
): Promise<AesKey> {
  const s = subtle();
  const material = await s.importKey("raw", new TextEncoder().encode(passphrase), "PBKDF2", false, [
    "deriveKey",
  ]);
  return s.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

/**
 * Chiffre un instantané de session (600 000 itérations PBKDF2, imposées).
 * Les tests utilisent `mapping-file.test-utils.ts`, qui produit un fichier
 * à itérations réduites sans que ce module n'expose un paramètre d'itérations.
 */
export async function encryptSnapshot(
  snapshot: SessionSnapshot,
  passphrase: string,
): Promise<string> {
  const iterations = DEFAULT_ITERATIONS;
  const phrase = preparePassphrase(passphrase);
  const valid = validateSnapshot(snapshot);
  // Disponibilité de WebCrypto vérifiée avant tout tirage aléatoire.
  const s = subtle();
  const rng = (globalThis as { crypto?: { getRandomValues?: unknown } }).crypto?.getRandomValues;
  if (typeof rng !== "function") {
    throw new CryptoFormatError(
      "unavailable",
      "WebCrypto n'est pas disponible dans cet environnement.",
    );
  }
  const header: Header = {
    format: MAPPING_FORMAT,
    v: MAPPING_VERSION,
    kdf: KDF_NAME,
    iterations,
    cipher: CIPHER_NAME,
  };
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const key = await deriveKey(phrase, salt, iterations);
  const plaintext = new TextEncoder().encode(JSON.stringify(valid));
  const ciphertext = new Uint8Array(
    await s.encrypt(
      { name: "AES-GCM", iv, additionalData: canonicalHeader(header), tagLength: 128 },
      key,
      plaintext,
    ),
  );
  return JSON.stringify({
    format: header.format,
    v: header.v,
    kdf: header.kdf,
    iterations: header.iterations,
    salt: toBase64(salt),
    cipher: header.cipher,
    iv: toBase64(iv),
    ciphertext: toBase64(ciphertext),
  });
}

/** Déchiffre et valide un fichier d'export. */
export async function decryptSnapshot(text: string, passphrase: string): Promise<SessionSnapshot> {
  const phrase = preparePassphrase(passphrase);

  let file: unknown;
  try {
    file = JSON.parse(text);
  } catch {
    throw new CryptoFormatError("malformed-file", MSG_MALFORMED);
  }
  if (typeof file !== "object" || file === null || Array.isArray(file)) {
    throw new CryptoFormatError("malformed-file", MSG_MALFORMED);
  }
  const f = file as Record<string, unknown>;

  // Une clé inconnue ne serait pas authentifiée (hors AAD) : on la refuse.
  if (Object.keys(f).some((k) => !FILE_KEYS.has(k))) {
    throw new CryptoFormatError("unsupported-format", MSG_UNSUPPORTED);
  }

  if (
    f.format !== MAPPING_FORMAT ||
    f.v !== MAPPING_VERSION ||
    f.kdf !== KDF_NAME ||
    f.cipher !== CIPHER_NAME
  ) {
    throw new CryptoFormatError("unsupported-format", MSG_UNSUPPORTED);
  }
  const iterations = f.iterations;
  if (
    typeof iterations !== "number" ||
    !Number.isInteger(iterations) ||
    iterations < MIN_ITERATIONS ||
    iterations > MAX_ITERATIONS
  ) {
    throw new CryptoFormatError(
      "invalid-parameters",
      `Nombre d'itérations refusé : il doit être compris entre ${MIN_ITERATIONS} et ${MAX_ITERATIONS}.`,
    );
  }
  const salt = fromBase64(f.salt, SALT_BYTES);
  const iv = fromBase64(f.iv, IV_BYTES);
  const ciphertext = fromBase64(f.ciphertext);
  if (ciphertext.length < 16) throw new CryptoFormatError("malformed-file", MSG_MALFORMED);

  const header: Header = {
    format: MAPPING_FORMAT,
    v: MAPPING_VERSION,
    kdf: KDF_NAME,
    iterations,
    cipher: CIPHER_NAME,
  };
  let plaintext: ArrayBuffer;
  try {
    const key = await deriveKey(phrase, salt, iterations);
    plaintext = await subtle().decrypt(
      { name: "AES-GCM", iv, additionalData: canonicalHeader(header), tagLength: 128 },
      key,
      ciphertext,
    );
  } catch (e) {
    if (e instanceof CryptoFormatError) throw e;
    throw new CryptoFormatError("authentication-failed", MSG_AUTH);
  }

  let data: unknown;
  try {
    data = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(plaintext));
  } catch {
    throw new CryptoFormatError("authentication-failed", MSG_AUTH);
  }
  if ((data as { format?: unknown } | null)?.format !== SNAPSHOT_FORMAT) {
    throw new CryptoFormatError("unsupported-format", MSG_UNSUPPORTED);
  }
  return validateSnapshot(data);
}
