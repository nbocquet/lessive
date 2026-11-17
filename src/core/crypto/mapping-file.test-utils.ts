/**
 * Utilitaire RÉSERVÉ AUX TESTS (ne pas importer hors de `*.test.ts`) : produit
 * un fichier d'export avec un nombre d'itérations réduit, pour la rapidité.
 * Implémentation volontairement indépendante de `mapping-file.ts` : elle
 * recompose le format avec WebCrypto, ce qui recoupe l'implémentation réelle.
 * N'applique ni la longueur minimale ni la normalisation de la phrase de
 * passe : c'est le travail de l'API publique, testé séparément.
 */
import { validateSnapshot } from "../mapping/snapshot.ts";
import type { SessionSnapshot } from "../mapping/snapshot.ts";
import { CIPHER_NAME, KDF_NAME, MAPPING_FORMAT, MAPPING_VERSION } from "./mapping-file.ts";

const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));

/** En-tête canonique passé en AAD (même ordre de clés que le format). */
export function canonicalHeaderBytes(iterations: number): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(
    JSON.stringify({
      format: MAPPING_FORMAT,
      v: MAPPING_VERSION,
      kdf: KDF_NAME,
      iterations,
      cipher: CIPHER_NAME,
    }),
  );
}

export async function deriveTestKey(
  passphrase: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number,
  usages: ("encrypt" | "decrypt")[] = ["encrypt", "decrypt"],
) {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    usages,
  );
}

export async function encryptSnapshotWithIterations(
  snapshot: SessionSnapshot,
  passphrase: string,
  iterations: number,
): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveTestKey(passphrase, salt, iterations);
  const plaintext = new TextEncoder().encode(JSON.stringify(validateSnapshot(snapshot)));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv, additionalData: canonicalHeaderBytes(iterations), tagLength: 128 },
      key,
      plaintext,
    ),
  );
  return JSON.stringify({
    format: MAPPING_FORMAT,
    v: MAPPING_VERSION,
    kdf: KDF_NAME,
    iterations,
    salt: b64(salt),
    cipher: CIPHER_NAME,
    iv: b64(iv),
    ciphertext: b64(ciphertext),
  });
}
