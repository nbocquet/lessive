/**
 * Aller-retour export → import depuis le code de l'interface (PseudoLogic), avec le vrai moteur
 * (600 000 itérations PBKDF2). Données synthétiques uniquement.
 */
import { describe, expect, it } from "vitest";
import {
  createSession,
  transform,
  type Detection,
  type EntityType,
  type Session,
} from "../../core/index.ts";
import { exportSession, importSession } from "./PseudoLogic.ts";

const TEXT = "Alice Test écrit à bob.test@example.org. Plus tard, A. Test relit.";
const PASSPHRASE = "phrase de passe synthétique";

function detection(id: string, value: string, entityType: EntityType): Detection {
  const start = TEXT.indexOf(value);
  return {
    id,
    start,
    end: start + value.length,
    entityType,
    score: 1,
    recognizerId: "test",
    packId: "test",
    source: "manual",
    explanation: [],
  };
}

function pseudonymize(session: Session): string {
  return transform(
    TEXT,
    [
      detection("d1", "Alice Test", "PERSON"),
      detection("d2", "bob.test@example.org", "EMAIL"),
      detection("d3", "A. Test", "PERSON"),
    ],
    { mode: "pseudonymization", defaultOperator: "pseudonymize" },
    session,
  ).text;
}

describe("export puis import chiffrés", () => {
  it("restitue la même table : mêmes pseudonymes, même texte transformé", async () => {
    const session = createSession();
    const before = pseudonymize(session);
    const file = await exportSession(session, PASSPHRASE, new Date(2026, 10, 17));
    expect(file.fileName).toBe("lessive-correspondances-2026-11-17.json");

    // Le fichier ne contient ni valeur d'origine ni phrase de passe en clair.
    expect(file.content).not.toContain("Alice");
    expect(file.content).not.toContain("bob.test");
    expect(file.content).not.toContain(PASSPHRASE);

    const restored = await importSession(file.content, PASSPHRASE);
    expect(restored.entities()).toEqual(session.entities());
    expect(pseudonymize(restored)).toBe(before);
    expect(restored.byPseudonym("PERSONNE_001")?.surfaceForms).toContain("Alice Test");
  });

  it("garde fusion et scission faites avant l'export", async () => {
    const session = createSession();
    pseudonymize(session);
    const persons = session.entities().filter((e) => e.entityType === "PERSON");
    expect(persons).toHaveLength(1); // « A. Test » est rattachée à « Alice Test »
    session.split(persons[0]!.id, "A. Test");
    const file = await exportSession(session, PASSPHRASE);
    const restored = await importSession(file.content, PASSPHRASE);
    expect(restored.entities().filter((e) => e.entityType === "PERSON")).toHaveLength(2);
  });

  it("refuse une mauvaise phrase de passe, sans la citer", async () => {
    const session = createSession();
    pseudonymize(session);
    const file = await exportSession(session, PASSPHRASE);
    const wrong = "une autre phrase de passe";
    await expect(importSession(file.content, wrong)).rejects.toMatchObject({
      code: "authentication-failed",
    });
    await importSession(file.content, wrong).catch((e: Error) => {
      expect(e.message).not.toContain(wrong);
    });
  });

  it("refuse un fichier altéré, un format inconnu et un fichier illisible", async () => {
    const session = createSession();
    pseudonymize(session);
    const file = await exportSession(session, PASSPHRASE);

    const tampered = JSON.parse(file.content) as { ciphertext: string };
    const bytes = atob(tampered.ciphertext);
    tampered.ciphertext = btoa(String.fromCharCode(bytes.charCodeAt(0) ^ 1) + bytes.slice(1));
    await expect(importSession(JSON.stringify(tampered), PASSPHRASE)).rejects.toMatchObject({
      code: "authentication-failed",
    });

    const future = { ...(JSON.parse(file.content) as object), v: 99 };
    await expect(importSession(JSON.stringify(future), PASSPHRASE)).rejects.toMatchObject({
      code: "unsupported-format",
    });

    await expect(importSession("pas du json", PASSPHRASE)).rejects.toMatchObject({
      code: "malformed-file",
    });
  });

  it("refuse l'export avec une phrase trop courte", async () => {
    await expect(exportSession(createSession(), "court")).rejects.toMatchObject({
      code: "passphrase-too-short",
    });
  });
});
