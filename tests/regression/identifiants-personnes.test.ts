/** Identifiants NER et noms complets : même personne (#13), données fictives. */
import { describe, expect, it } from "vitest";
import {
  createAnalyzer,
  createSession,
  reidentify,
  restoreSession,
  serializeSession,
  transform,
  type NerEngine,
} from "../../src/core/index.ts";

const plan = { mode: "pseudonymization", defaultOperator: "pseudonymize" } as const;
const pairs = [
  ["Claire Martin", "CMARTIN"],
  ["Élodie Morel", "EMOREL"],
  ["Jean-Pierre Lambert", "JPLAMBERT"],
] as const;

/** Le faux NER étiquette aussi le login : la propagation n'en produit pas de doublon. */
function fakeNer(values: readonly string[]): NerEngine {
  return {
    load: async () => {},
    dispose: async () => {},
    recognize: async (text, ctx) =>
      values.map((value) => {
        const start = text.indexOf(value);
        if (start < 0) throw new Error("Forme synthétique introuvable.");
        return {
          id: ctx.nextId(),
          start,
          end: start + value.length,
          entityType: "PERSON" as const,
          score: 0.99,
          recognizerId: "ner/fictif",
          packId: "ner",
          source: "ner" as const,
          explanation: [],
        };
      }),
  };
}
const analyzer = createAnalyzer([]);

describe("identifiants dérivés déjà détectés par le NER (#13)", () => {
  for (const [name, login] of pairs) {
    it.each([false, true])(`${name} / ${login}, login avant le nom : %s`, async (loginFirst) => {
      const values = loginFirst ? [login, name] : [name, login];
      const text = `😀 | ${values.join(" | ")} |`;
      const result = await analyzer.analyze(text, { ner: fakeNer(values) });
      expect(result.detections).toHaveLength(2);
      expect(result.detections.map((d) => d.source)).toEqual(["ner", "ner"]);
      expect(result.detections[0]?.start).toBe(5);
      const session = createSession();
      const output = transform(text, result.detections, plan, session);
      expect(output.errors).toEqual([]);
      expect(output.text).toBe("😀 | PERSONNE_001 | PERSONNE_001 |");
      expect(session.entities()).toHaveLength(1);
      expect(session.entities()[0]?.needsReview).toBe(true);
      expect(session.entities()[0]?.surfaceForms).toEqual([name, login]);
      // Le repère unique se réidentifie vers le nom complet, même si le login précédait le nom.
      expect(reidentify(output.text, session).text).toBe(`😀 | ${name} | ${name} |`);
      const masked = transform(text, result.detections, {
        mode: "masking",
        defaultOperator: "categorize",
      });
      expect(masked.text).toBe("😀 | [PERSONNE] | [PERSONNE] |");
    });
  }

  it("ne choisit pas le premier nom complet lorsqu'un login est ambigu", async () => {
    const values = ["CMARTIN", "Claire Martin", "Camille Martin"];
    const text = values.join(" / ");
    const result = await analyzer.analyze(text, { ner: fakeNer(values) });
    const session = createSession();
    const output = transform(text, result.detections, plan, session);
    expect(output.text).toBe("PERSONNE_003 / PERSONNE_001 / PERSONNE_002");
    expect(session.entities()[2]?.needsReview).toBe(true);
  });

  it("conserve le repère d'un document à l'autre et après restauration de session", async () => {
    const session = createSession();
    const first = "Claire Martin";
    const firstResult = await analyzer.analyze(first, { ner: fakeNer([first]) });
    expect(transform(first, firstResult.detections, plan, session).text).toBe("PERSONNE_001");
    const restored = restoreSession(serializeSession(session));
    const second = "CMARTIN";
    const secondResult = await analyzer.analyze(second, { ner: fakeNer([second]) });
    expect(transform(second, secondResult.detections, plan, restored).text).toBe("PERSONNE_001");
    expect(reidentify("PERSONNE_001", restored).text).toBe(first);
    expect(restored.entities()).toHaveLength(1);
  });
});
