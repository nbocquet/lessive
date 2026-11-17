import { afterEach, describe, expect, it, vi } from "vitest";
import { createSession, restoreSession, serializeSession } from "../mapping/index.ts";
import type { SessionSnapshot } from "../mapping/index.ts";
import { run } from "../mapping/test-helpers.ts";
import { CryptoFormatError } from "./errors.ts";
import { decryptSnapshot, encryptSnapshot } from "./mapping-file.ts";
import * as fileModule from "./mapping-file.ts";
import {
  canonicalHeaderBytes,
  deriveTestKey,
  encryptSnapshotWithIterations,
} from "./mapping-file.test-utils.ts";
import * as publicApi from "./index.ts";

const PASS = "correct horse battery staple";
const FAST = 100_000;

function sampleSnapshot(): SessionSnapshot {
  const s = createSession({ id: "sess-crypto" });
  run(s, "Claire Martin écrit à Paul Dupont à Lausanne.", [
    ["Claire Martin", "PERSON"],
    ["Paul Dupont", "PERSON"],
    ["Lausanne", "LOCATION"],
  ]);
  return serializeSession(s);
}

const enc = (snap = sampleSnapshot(), pass = PASS) =>
  encryptSnapshotWithIterations(snap, pass, FAST);

type FileJson = Record<string, unknown>;
const parse = (t: string) => JSON.parse(t) as FileJson;

function flipByte(b64: string, index = 0): string {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  bytes[index] = (bytes[index] ?? 0) ^ 0x01;
  return btoa(String.fromCharCode(...bytes));
}

async function expectError(p: Promise<unknown>, code: string, message?: RegExp) {
  const err = await p.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(CryptoFormatError);
  expect((err as CryptoFormatError).code).toBe(code);
  if (message) expect((err as Error).message).toMatch(message);
  return err as CryptoFormatError;
}

describe("export chiffré : aller-retour", () => {
  it("session → snapshot → chiffré → déchiffré → session → nouveau texte", async () => {
    const original = createSession({ id: "orig" });
    run(original, "Claire Martin écrit à Paul Dupont.", [
      ["Claire Martin", "PERSON"],
      ["Paul Dupont", "PERSON"],
    ]);
    const text = await enc(serializeSession(original));
    const snap = await decryptSnapshot(text, PASS);
    expect(snap).toEqual(serializeSession(original));
    const restored = restoreSession(snap);
    const out = run(restored, "Paul Dupont répond à Claire Martin et à Anne Leroy.", [
      ["Paul Dupont", "PERSON"],
      ["Claire Martin", "PERSON"],
      ["Anne Leroy", "PERSON"],
    ]);
    expect(out).toBe("PERSONNE_002 répond à PERSONNE_001 et à PERSONNE_003.");
  });

  it("le fichier a le format annoncé", async () => {
    const f = parse(await enc());
    expect(Object.keys(f)).toEqual([
      "format",
      "v",
      "kdf",
      "iterations",
      "salt",
      "cipher",
      "iv",
      "ciphertext",
    ]);
    expect(f).toMatchObject({
      format: "lessive-mapping",
      v: 1,
      kdf: "PBKDF2-SHA-256",
      iterations: FAST,
      cipher: "AES-256-GCM",
    });
    expect(atob(f.salt as string)).toHaveLength(16);
    expect(atob(f.iv as string)).toHaveLength(12);
  });

  it("le déchiffrement normalise la phrase en NFC", async () => {
    const nfc = "été-trop-long-1".normalize("NFC");
    const text = await enc(sampleSnapshot(), nfc); // l'utilitaire ne normalise pas
    await expect(decryptSnapshot(text, nfc.normalize("NFD"))).resolves.toBeDefined();
  });

  it("deux exports de la même session donnent des chiffrés différents", async () => {
    const snap = sampleSnapshot();
    const a = parse(await enc(snap));
    const b = parse(await enc(snap));
    expect(a.salt).not.toBe(b.salt);
    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  it("le texte chiffré ne contient aucune forme originale", async () => {
    const text = await enc();
    for (const name of [
      "Claire",
      "Martin",
      "Paul",
      "Dupont",
      "Lausanne",
      "PERSONNE",
      "sess-crypto",
    ]) {
      expect(text).not.toContain(name);
    }
    const f = parse(text);
    const raw = atob(f.ciphertext as string);
    for (const name of ["Claire", "Dupont", "Lausanne", "PERSONNE"])
      expect(raw).not.toContain(name);
  });
});

describe("phrase de passe", () => {
  it("refuse une phrase trop courte, sans la citer", async () => {
    const tooShort = "abc-1234-xy"; // 11 caractères
    const err = await expectError(
      encryptSnapshot(sampleSnapshot(), tooShort),
      "passphrase-too-short",
      /12 caractères/,
    );
    expect(err.message).not.toContain(tooShort);
    await expectError(decryptSnapshot(await enc(), tooShort), "passphrase-too-short");
  });

  it("compte les caractères après normalisation NFC", async () => {
    // 11 « é » décomposés : 22 unités UTF-16, mais 11 caractères après NFC.
    const nfd = "é".normalize("NFD").repeat(11);
    expect(nfd.length).toBe(22);
    await expectError(encryptSnapshot(sampleSnapshot(), nfd), "passphrase-too-short");
  });

  it("refuse une phrase mal formée (moitié de paire isolée), sans la citer", async () => {
    const lone = "phrase-de-passe-\ud83d-fin"; // surrogate haut isolé
    const lone2 = "phrase-de-passe-\ude00-fin"; // surrogate bas isolé
    for (const bad of [lone, lone2]) {
      const err = await expectError(
        encryptSnapshot(sampleSnapshot(), bad),
        "invalid-parameters",
        /invalide/,
      );
      expect(err.message).not.toContain("phrase-de-passe");
      await expectError(decryptSnapshot(await enc(), bad), "invalid-parameters");
    }
    // Deux phrases mal formées différentes ne doivent pas se confondre.
    await expectError(encryptSnapshot(sampleSnapshot(), lone), "invalid-parameters");
    await expectError(encryptSnapshot(sampleSnapshot(), lone2), "invalid-parameters");
    // Une paire valide reste acceptée.
    await expect(enc(sampleSnapshot(), "phrase-de-passe-\ud83d\ude00-fin")).resolves.toBeTypeOf(
      "string",
    );
  });

  it("accepte exactement 12 caractères et compte les points de code", async () => {
    await expect(enc(sampleSnapshot(), "123456789012")).resolves.toBeTypeOf("string");
    await expect(enc(sampleSnapshot(), "😀".repeat(12))).resolves.toBeTypeOf("string");
    await expectError(encryptSnapshot(sampleSnapshot(), "😀".repeat(11)), "passphrase-too-short");
  });

  it("une mauvaise phrase donne l'erreur unique, sans la citer", async () => {
    const wrong = "une-autre-phrase-de-passe";
    const err = await expectError(
      decryptSnapshot(await enc(), wrong),
      "authentication-failed",
      /^Phrase de passe incorrecte ou fichier altéré\.$/,
    );
    expect(err.message).not.toContain(wrong);
  });
});

describe("fichier altéré ou invalide", () => {
  it.each(["ciphertext", "iv", "salt"])("un octet modifié dans %s", async (field) => {
    const f = parse(await enc());
    f[field] = flipByte(f[field] as string, field === "ciphertext" ? 5 : 0);
    await expectError(
      decryptSnapshot(JSON.stringify(f), PASS),
      "authentication-failed",
      /incorrecte ou fichier altéré/,
    );
  });

  it("le dernier octet du ciphertext (tag) modifié", async () => {
    const f = parse(await enc());
    const len = atob(f.ciphertext as string).length;
    f.ciphertext = flipByte(f.ciphertext as string, len - 1);
    await expectError(decryptSnapshot(JSON.stringify(f), PASS), "authentication-failed");
  });

  it("l'en-tête est authentifié : itérations modifiées dans les bornes", async () => {
    const f = parse(await enc());
    f.iterations = FAST + 1;
    await expectError(
      decryptSnapshot(JSON.stringify(f), PASS),
      "authentication-failed",
      /incorrecte ou fichier altéré/,
    );
  });

  it("l'en-tête est authentifié : l'AAD est bien utilisée", async () => {
    // Même clé, même IV, même chiffré : seul l'AAD change.
    const f = parse(await enc());
    const bytes = (v: unknown) => Uint8Array.from(atob(v as string), (c) => c.charCodeAt(0));
    const salt = bytes(f.salt);
    const iv = bytes(f.iv);
    const ciphertext = bytes(f.ciphertext);
    const key = await deriveTestKey(PASS, salt, FAST, ["decrypt"]);
    const tryDecrypt = (aad: Uint8Array<ArrayBuffer>) =>
      crypto.subtle.decrypt(
        { name: "AES-GCM", iv, additionalData: aad, tagLength: 128 },
        key,
        ciphertext,
      );

    // En-tête canonique inchangé : le déchiffrement réussit.
    await expect(tryDecrypt(canonicalHeaderBytes(FAST))).resolves.toBeInstanceOf(ArrayBuffer);
    // En-tête modifié dans l'AAD (clé inchangée) : échec.
    await expect(tryDecrypt(canonicalHeaderBytes(FAST + 1))).rejects.toThrow();
    await expect(tryDecrypt(new Uint8Array(0))).rejects.toThrow();
  });

  it("clé de premier niveau inconnue → format non pris en charge", async () => {
    for (const extra of ["comment", "padding", "v2"]) {
      const f = parse(await enc());
      f[extra] = "non authentifié";
      await expectError(
        decryptSnapshot(JSON.stringify(f), PASS),
        "unsupported-format",
        /^Format non pris en charge\.$/,
      );
    }
  });

  it("version inconnue → format non pris en charge", async () => {
    for (const v of [2, 0, "1", null]) {
      const f = parse(await enc());
      f.v = v;
      await expectError(
        decryptSnapshot(JSON.stringify(f), PASS),
        "unsupported-format",
        /^Format non pris en charge\.$/,
      );
    }
  });

  it("format, kdf ou chiffrement inconnus → format non pris en charge", async () => {
    for (const [k, v] of [
      ["format", "autre"],
      ["kdf", "scrypt"],
      ["cipher", "AES-128-CBC"],
    ] as const) {
      const f = parse(await enc());
      f[k] = v;
      await expectError(decryptSnapshot(JSON.stringify(f), PASS), "unsupported-format");
    }
  });

  it.each([0, 1, 99_999, 5_000_001, -1, 1e12, 600000.5, "600000", null])(
    "itérations hors bornes ou invalides (%s)",
    async (iterations) => {
      const f = parse(await enc());
      f.iterations = iterations;
      await expectError(
        decryptSnapshot(JSON.stringify(f), PASS),
        "invalid-parameters",
        /itérations/,
      );
    },
  );

  it("accepte la borne basse de 100 000 itérations", async () => {
    await expect(decryptSnapshot(await enc(), PASS)).resolves.toBeDefined();
  });

  it("texte non JSON, JSON non objet, champs manquants ou mal encodés", async () => {
    await expectError(decryptSnapshot("pas du json", PASS), "malformed-file");
    await expectError(decryptSnapshot("[1,2]", PASS), "malformed-file");
    await expectError(decryptSnapshot("null", PASS), "malformed-file");
    const good = parse(await enc());
    for (const [k, v] of [
      ["salt", undefined],
      ["iv", "AAAA"],
      ["salt", "%%%"],
      ["ciphertext", "AA=="],
      ["ciphertext", 12],
    ] as const) {
      const f = { ...good };
      if (v === undefined) delete f[k];
      else f[k] = v;
      await expectError(decryptSnapshot(JSON.stringify(f), PASS), "malformed-file");
    }
  });
});

describe("WebCrypto indisponible", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("lève « unavailable » avant tout tirage aléatoire", async () => {
    const getRandomValues = vi.fn();
    vi.stubGlobal("crypto", { getRandomValues });
    await expectError(encryptSnapshot(sampleSnapshot(), PASS), "unavailable");
    expect(getRandomValues).not.toHaveBeenCalled();
    vi.stubGlobal("crypto", undefined);
    await expectError(encryptSnapshot(sampleSnapshot(), PASS), "unavailable");
  });
});

describe("API publique", () => {
  it("n'expose pas la fonction à itérations injectables (ni index.ts, ni le module)", () => {
    expect(Object.keys(publicApi)).not.toContain("encryptSnapshotWithIterations");
    expect(Object.keys(fileModule)).not.toContain("encryptSnapshotWithIterations");
    expect(publicApi.encryptSnapshot.length).toBe(2);
    expect(publicApi.DEFAULT_ITERATIONS).toBe(600_000);
  });

  it("mesure la dérivation réelle à 600 000 itérations (aller-retour)", async () => {
    const t0 = performance.now();
    const text = await encryptSnapshot(sampleSnapshot(), PASS);
    const t1 = performance.now();
    const snap = await decryptSnapshot(text, PASS);
    const t2 = performance.now();
    // La phrase est normalisée en NFC aussi à l'export public.
    const nfd = "été-trop-long-1".normalize("NFD");
    await expect(
      decryptSnapshot(await encryptSnapshot(sampleSnapshot(), nfd), nfd.normalize("NFC")),
    ).resolves.toBeDefined();
    expect(parse(text).iterations).toBe(600_000);
    expect(snap.sessionId).toBe("sess-crypto");
    // Durées indicatives, reportées dans le compte rendu.
    process.stdout.write(
      `[T4.5] PBKDF2 600000 : chiffrement ${(t1 - t0).toFixed(0)} ms, déchiffrement ${(t2 - t1).toFixed(0)} ms\n`,
    );
  }, 30_000);
});
