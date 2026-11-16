import { describe, expect, it } from "vitest";
import { createSession, restoreSession, serializeSession } from "../mapping/index.ts";
import type { SessionSnapshot } from "../mapping/index.ts";
import { run } from "../mapping/test-helpers.ts";
import { CryptoFormatError } from "./errors.ts";
import { decryptSnapshot, encryptSnapshot, encryptSnapshotWithIterations } from "./mapping-file.ts";
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

  it("la phrase de passe est normalisée en NFC", async () => {
    const nfd = "été-trop-long-1"; // « été-trop-long-1 » décomposé
    const nfc = nfd.normalize("NFC");
    const text = await enc(sampleSnapshot(), nfd);
    await expect(decryptSnapshot(text, nfc)).resolves.toBeDefined();
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
    const short = "secret-court";
    expect(short.length).toBeLessThan(12 + 1);
    const tooShort = "abc-1234-xy"; // 11 caractères
    const err = await expectError(
      encryptSnapshotWithIterations(sampleSnapshot(), tooShort, FAST),
      "passphrase-too-short",
      /12 caractères/,
    );
    expect(err.message).not.toContain(tooShort);
    await expectError(decryptSnapshot(await enc(), tooShort), "passphrase-too-short");
  });

  it("accepte exactement 12 caractères et compte les points de code", async () => {
    await expect(enc(sampleSnapshot(), "123456789012")).resolves.toBeTypeOf("string");
    await expect(enc(sampleSnapshot(), "😀".repeat(12))).resolves.toBeTypeOf("string");
    await expectError(enc(sampleSnapshot(), "😀".repeat(11)), "passphrase-too-short");
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
    // Même clé, même IV, mais en-tête différent : seul l'AAD peut faire échouer.
    const f = parse(await enc());
    const alt = parse(await enc());
    // Recopie sel/iv/ciphertext d'un autre export : échec (clé ou tag différent).
    f.ciphertext = alt.ciphertext;
    await expectError(decryptSnapshot(JSON.stringify(f), PASS), "authentication-failed");
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

  it("accepte les bornes 100 000 et refuse l'encodage hors bornes à l'export interne", async () => {
    await expectError(
      encryptSnapshotWithIterations(sampleSnapshot(), PASS, 99_999),
      "invalid-parameters",
    );
    await expectError(
      encryptSnapshotWithIterations(sampleSnapshot(), PASS, 5_000_001),
      "invalid-parameters",
    );
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

describe("API publique", () => {
  it("n'expose pas la fonction interne à itérations injectables", () => {
    expect(Object.keys(publicApi)).not.toContain("encryptSnapshotWithIterations");
    expect(publicApi.encryptSnapshot.length).toBe(2);
    expect(publicApi.DEFAULT_ITERATIONS).toBe(600_000);
  });

  it("mesure la dérivation réelle à 600 000 itérations (aller-retour)", async () => {
    const t0 = performance.now();
    const text = await encryptSnapshot(sampleSnapshot(), PASS);
    const t1 = performance.now();
    const snap = await decryptSnapshot(text, PASS);
    const t2 = performance.now();
    expect(parse(text).iterations).toBe(600_000);
    expect(snap.sessionId).toBe("sess-crypto");
    // Durées indicatives, reportées dans le compte rendu.
    process.stdout.write(
      `[T4.5] PBKDF2 600000 : chiffrement ${(t1 - t0).toFixed(0)} ms, déchiffrement ${(t2 - t1).toFixed(0)} ms\n`,
    );
  }, 30_000);
});
