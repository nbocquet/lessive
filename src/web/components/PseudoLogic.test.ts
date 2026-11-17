import { describe, expect, it } from "vitest";
import { CryptoFormatError, SnapshotError, type Entity } from "../../core/index.ts";
import {
  countNeedingReview,
  describeSessionError,
  entityRows,
  exportFileName,
  isSessionEmpty,
  mergeCandidates,
  passphraseLength,
  validateNewPassphrase,
} from "./PseudoLogic.ts";

function entity(id: string, over: Partial<Entity>): Entity {
  return {
    id,
    entityType: "PERSON",
    pseudonym: "PERSONNE_001",
    surfaceForms: ["Alice Test"],
    needsReview: false,
    ...over,
  };
}

describe("nom du fichier d'export", () => {
  it("suit lessive-correspondances-AAAA-MM-JJ.json", () => {
    expect(exportFileName(new Date(2026, 10, 17))).toBe("lessive-correspondances-2026-11-17.json");
    expect(exportFileName(new Date(2027, 2, 3))).toBe("lessive-correspondances-2027-03-03.json");
  });
});

describe("validation de la phrase de passe", () => {
  const good = "correct horse battery";

  it("accepte une phrase assez longue saisie deux fois à l'identique", () => {
    expect(validateNewPassphrase(good, good)).toEqual({ ok: true });
  });

  it("refuse moins de 12 caractères, sans citer la phrase", () => {
    const check = validateNewPassphrase("zorglub", "zorglub");
    expect(check.ok).toBe(false);
    if (!check.ok) {
      expect(check.issue).toBe("too-short");
      expect(check.message).toContain("12");
      expect(check.message).not.toContain("zorglub");
    }
    expect(validateNewPassphrase("a".repeat(11), "a".repeat(11)).ok).toBe(false);
    expect(validateNewPassphrase("a".repeat(12), "a".repeat(12)).ok).toBe(true);
  });

  it("refuse deux saisies différentes", () => {
    const check = validateNewPassphrase(good, `${good}!`);
    expect(check).toMatchObject({ ok: false, issue: "mismatch" });
  });

  it("compte les caractères (points de code, NFC) comme le moteur", () => {
    expect(passphraseLength("é".repeat(6))).toBe(6);
    expect(passphraseLength("😀".repeat(12))).toBe(12);
    expect(validateNewPassphrase("😀".repeat(12), "😀".repeat(12)).ok).toBe(true);
    expect(validateNewPassphrase("😀".repeat(11), "😀".repeat(11)).ok).toBe(false);
  });

  it("refuse une séquence UTF-16 invalide", () => {
    const bad = "abcdefghijkl\ud800";
    expect(validateNewPassphrase(bad, bad)).toMatchObject({ ok: false, issue: "invalid" });
  });
});

describe("lignes d'entités", () => {
  const entities: Entity[] = [
    entity("e1", { pseudonym: "PERSONNE_010", surfaceForms: ["Alice Test", "A. Test"] }),
    entity("e2", { pseudonym: "PERSONNE_002", surfaceForms: ["Bob Exemple"], needsReview: true }),
    entity("e3", {
      entityType: "ORGANIZATION",
      pseudonym: "ORGANISATION_001",
      surfaceForms: ["Société Exemple", "société exemple"],
    }),
    entity("e4", { pseudonym: "PERSONNE_003", surfaceForms: ["Chloé Demo", "Chloé Demo"] }),
  ];
  const rows = entityRows(entities);

  it("met les entités à vérifier en premier, puis trie par catégorie et ordre naturel", () => {
    expect(rows.map((r) => r.pseudonym)).toEqual([
      "PERSONNE_002",
      "ORGANISATION_001",
      "PERSONNE_003",
      "PERSONNE_010",
    ]);
    expect(countNeedingReview(rows)).toBe(1);
  });

  it("donne la catégorie en français et les formes sans doublon exact", () => {
    const org = rows.find((r) => r.id === "e3");
    expect(org?.categoryLabel).toBe("ORGANISATION");
    expect(rows.find((r) => r.id === "e4")?.forms).toEqual(["Chloé Demo"]);
  });

  it("n'autorise la scission que s'il y a au moins deux formes distinctes après normalisation", () => {
    expect(rows.find((r) => r.id === "e1")?.splittable).toBe(true);
    expect(rows.find((r) => r.id === "e2")?.splittable).toBe(false);
    // « Société Exemple » et « société exemple » ne diffèrent que par la casse.
    expect(rows.find((r) => r.id === "e3")?.splittable).toBe(false);
  });

  it("propose à la fusion les autres entités de la même catégorie", () => {
    expect(
      mergeCandidates(rows, "e1")
        .map((r) => r.id)
        .sort(),
    ).toEqual(["e2", "e4"]);
    expect(mergeCandidates(rows, "e3")).toEqual([]);
    expect(mergeCandidates(rows, "inconnu")).toEqual([]);
  });
});

describe("session vide", () => {
  it("vaut vrai pour null ou une session sans entité", () => {
    expect(isSessionEmpty(null)).toBe(true);
    expect(isSessionEmpty({ entities: () => [] } as never)).toBe(true);
    expect(isSessionEmpty({ entities: () => [entity("e1", {})] } as never)).toBe(false);
  });
});

describe("messages d'erreur", () => {
  it("distingue phrase incorrecte, format non pris en charge et fichier illisible", () => {
    expect(describeSessionError(new CryptoFormatError("authentication-failed", "x"))).toBe(
      "Phrase de passe incorrecte ou fichier altéré.",
    );
    expect(describeSessionError(new CryptoFormatError("unsupported-format", "x"))).toContain(
      "Format non pris en charge",
    );
    expect(describeSessionError(new CryptoFormatError("malformed-file", "x"))).toContain(
      "illisible",
    );
  });

  it("reprend le message du moteur pour les autres codes et reste générique pour le reste", () => {
    expect(
      describeSessionError(new CryptoFormatError("passphrase-too-short", "Trop courte.")),
    ).toBe("Trop courte.");
    expect(describeSessionError(new SnapshotError("détail interne"))).not.toContain("interne");
    expect(describeSessionError(new Error("secret-valeur"))).toBe("Opération impossible.");
  });
});
