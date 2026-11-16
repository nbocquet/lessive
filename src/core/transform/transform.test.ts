import { describe, expect, it } from "vitest";
import type { Detection, EntityType, TransformPlan } from "../types/index.ts";
import { createSession } from "../mapping/session.ts";
import { TransformError, transform } from "./transform.ts";

/** Détection sur la première occurrence de `value` à partir de `from`. */
function find(
  text: string,
  value: string,
  entityType: EntityType,
  id: string,
  from = 0,
): Detection {
  const start = text.indexOf(value, from);
  if (start < 0) throw new Error("valeur introuvable dans le texte de test");
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

const pseudo: TransformPlan = { mode: "pseudonymization", defaultOperator: "pseudonymize" };

describe("transform", () => {
  const text =
    "Claire Martin écrit à jo@exemple.test ; Mme Martin habite à Lausanne. 😀 Claire Martin.";
  const dets = (): Detection[] => {
    const d1 = find(text, "Claire Martin", "PERSON", "d1");
    const d2 = find(text, "jo@exemple.test", "EMAIL", "d2");
    const d3 = find(text, "Mme Martin", "PERSON", "d3");
    const d4 = find(text, "Lausanne", "LOCATION", "d4");
    const d5 = find(text, "Claire Martin", "PERSON", "d5", d1.end);
    return [d1, d2, d3, d4, d5];
  };

  it("pseudonymise dans l'ordre du texte, même si les détections arrivent en désordre", () => {
    const session = createSession();
    const result = transform(text, [...dets()].reverse(), pseudo, session);
    expect(result.text).toBe(
      "PERSONNE_001 écrit à EMAIL_001 ; PERSONNE_001 habite à LIEU_001. 😀 PERSONNE_001.",
    );
    expect(result.errors).toEqual([]);
    expect(result.applied.map((a) => a.detectionId)).toEqual(["d1", "d2", "d3", "d4", "d5"]);
  });

  it("donne PERSONNE_001 à la première personne citée", () => {
    const t = "Paul Durand puis Claire Martin.";
    const result = transform(
      t,
      [find(t, "Claire Martin", "PERSON", "b"), find(t, "Paul Durand", "PERSON", "a")],
      pseudo,
      createSession(),
    );
    expect(result.text).toBe("PERSONNE_001 puis PERSONNE_002.");
  });

  it("calcule des positions de sortie exactes dans le texte final", () => {
    const plan: TransformPlan = {
      mode: "pseudonymization",
      defaultOperator: "mask",
      byEntityType: { PERSON: "pseudonymize", LOCATION: "categorize", EMAIL: "suppress" },
    };
    const result = transform(text, dets(), plan, createSession());
    for (const a of result.applied) {
      expect(result.text.slice(a.outputStart, a.outputEnd)).toBe(a.replacement);
      expect(text.slice(a.originalStart, a.originalEnd)).not.toBe(a.replacement);
    }
    expect(result.applied.map((a) => a.operator)).toEqual([
      "pseudonymize",
      "suppress",
      "pseudonymize",
      "categorize",
      "pseudonymize",
    ]);
    const suppressed = result.applied[1];
    expect(suppressed?.outputStart).toBe(suppressed?.outputEnd);
  });

  it("applique la priorité byDetectionId > byEntityType > defaultOperator", () => {
    const plan: TransformPlan = {
      mode: "masking",
      defaultOperator: "mask",
      byEntityType: { PERSON: "categorize", EMAIL: "suppress" },
      byDetectionId: { d5: "mask", d2: "categorize" },
    };
    const result = transform(text, dets(), plan);
    expect(result.applied.map((a) => [a.detectionId, a.operator])).toEqual([
      ["d1", "categorize"],
      ["d2", "categorize"],
      ["d3", "categorize"],
      ["d4", "mask"],
      ["d5", "mask"],
    ]);
    expect(result.text).toBe(
      "[PERSONNE] écrit à [EMAIL] ; [PERSONNE] habite à ********. 😀 ****** ******.",
    );
  });

  it("masque avec accents et emojis", () => {
    const t = "Voici Éloïse 😀 et Zoé 👩‍👩‍👧.";
    const result = transform(
      t,
      [find(t, "Éloïse 😀", "PERSON", "a"), find(t, "Zoé 👩‍👩‍👧", "PERSON", "b")],
      { mode: "masking", defaultOperator: "mask" },
    );
    expect(result.text).toBe("Voici ****** * et *** *.");
    for (const a of result.applied) {
      expect(result.text.slice(a.outputStart, a.outputEnd)).toBe(a.replacement);
    }
  });

  it("autorise la pseudonymisation mixte avec masquage dans le mode pseudonymization", () => {
    const result = transform(
      text,
      dets(),
      {
        mode: "pseudonymization",
        defaultOperator: "mask",
        byEntityType: { PERSON: "pseudonymize" },
      },
      createSession(),
    );
    expect(result.text.startsWith("PERSONNE_001 écrit à ")).toBe(true);
  });

  it("interdit pseudonymize en mode masquage, quelle que soit l'origine du choix", () => {
    const d = dets();
    const plans: TransformPlan[] = [
      { mode: "masking", defaultOperator: "pseudonymize" },
      { mode: "masking", defaultOperator: "mask", byEntityType: { PERSON: "pseudonymize" } },
      { mode: "masking", defaultOperator: "mask", byDetectionId: { d4: "pseudonymize" } },
    ];
    for (const plan of plans) {
      const session = createSession();
      expect(() => transform(text, d, plan, session)).toThrow(TransformError);
      expect(() => transform(text, d, plan, session)).toThrow(/masquage/);
      expect(session.entities()).toHaveLength(0);
    }
  });

  it("exige une session pour pseudonymize", () => {
    expect(() => transform(text, dets(), pseudo)).toThrow(/session/);
  });

  it("refuse un opérateur inconnu", () => {
    const plan = { mode: "masking", defaultOperator: "inconnu" } as unknown as TransformPlan;
    expect(() => transform(text, dets(), plan)).toThrow(TransformError);
  });

  it("refuse les détections qui se chevauchent, sans valeur originale dans l'erreur", () => {
    const a = find(text, "Claire Martin", "PERSON", "a");
    const b: Detection = { ...a, id: "b", start: a.start + 7, end: a.end + 5 };
    let message = "";
    try {
      transform(text, [a, b], { mode: "masking", defaultOperator: "mask" });
    } catch (e) {
      message = String(e);
    }
    expect(message).toMatch(/chevauchent/);
    expect(message).not.toContain("Claire");
    expect(message).not.toContain("Martin");
  });

  it("accepte des détections contiguës", () => {
    const t = "abcdef";
    const mk = (id: string, start: number, end: number): Detection => ({
      ...find(t, "abc", "PERSON", id),
      start,
      end,
    });
    const r = transform(t, [mk("x", 0, 3), mk("y", 3, 6)], {
      mode: "masking",
      defaultOperator: "categorize",
    });
    expect(r.text).toBe("[PERSONNE][PERSONNE]");
  });

  it("refuse les détections hors du texte, vides ou non entières", () => {
    const base = find(text, "Claire", "PERSON", "a");
    const plan: TransformPlan = { mode: "masking", defaultOperator: "mask" };
    for (const bad of [
      { ...base, end: text.length + 1 },
      { ...base, start: -1 },
      { ...base, start: 5, end: 5 },
      { ...base, start: 6, end: 2 },
      { ...base, start: 0.5 },
    ]) {
      expect(() => transform(text, [bad], plan)).toThrow(TransformError);
    }
  });

  it("renvoie le texte inchangé sans détection", () => {
    expect(transform("abc", [], { mode: "masking", defaultOperator: "mask" })).toEqual({
      text: "abc",
      applied: [],
      errors: [],
    });
  });

  it("ne contient aucune valeur originale dans applied ni dans errors", () => {
    const values = [
      "Claire Martin",
      "jo@exemple.test",
      "Mme Martin",
      "Lausanne",
      "Claire",
      "Martin",
    ];
    const plans: TransformPlan[] = [
      pseudo,
      { mode: "masking", defaultOperator: "mask" },
      { mode: "masking", defaultOperator: "categorize" },
      { mode: "masking", defaultOperator: "suppress" },
    ];
    for (const plan of plans) {
      const result = transform(text, dets(), plan, createSession());
      const dump = JSON.stringify(result.applied) + JSON.stringify(result.errors);
      for (const v of values) expect(dump).not.toContain(v);
    }
    // Idem pour les erreurs levées.
    for (const fn of [
      () => transform(text, dets(), { mode: "masking", defaultOperator: "pseudonymize" }),
      () => transform(text, [{ ...dets()[0]!, end: 9999 }], pseudo, createSession()),
    ]) {
      try {
        fn();
      } catch (e) {
        for (const v of values) expect(String(e)).not.toContain(v);
      }
    }
  });
});
