import { describe, expect, it } from "vitest";
import type { AnalysisContext, Detection } from "../types/index.ts";
import { mergeAdjacentPersons } from "./merge-persons.ts";

let n = 0;
const ctx: AnalysisContext = { nextId: () => `m${++n}` };

function person(text: string, value: string, score: number, from = 0): Detection {
  const start = text.indexOf(value, from);
  return {
    id: `p${start}`,
    start,
    end: start + value.length,
    entityType: "PERSON",
    score,
    recognizerId: "lang-fr-en/prenoms",
    packId: "lang-fr-en",
    source: "dictionary",
    explanation: ["dictionnaire"],
  };
}

describe("mergeAdjacentPersons", () => {
  it("réunit prénom et nom séparés par une espace", () => {
    const t = "Hier, Claire Müller a appelé.";
    const out = mergeAdjacentPersons(t, [person(t, "Claire", 0.45), person(t, "Müller", 0.4)], ctx);
    expect(out).toHaveLength(1);
    expect(t.slice(out[0]!.start, out[0]!.end)).toBe("Claire Müller");
    expect(out[0]!.score).toBeCloseTo(0.8);
  });

  it("réunit une suite de trois éléments", () => {
    const t = "Anne Marie Dubois";
    const out = mergeAdjacentPersons(
      t,
      [person(t, "Anne", 0.45), person(t, "Marie", 0.45), person(t, "Dubois", 0.4)],
      ctx,
    );
    expect(out.map((d) => t.slice(d.start, d.end))).toEqual(["Anne Marie Dubois"]);
  });

  it("ne réunit pas à travers une ponctuation, un mot ou un retour à la ligne", () => {
    for (const t of ["Claire, Müller", "Claire et Müller", "Claire\nMüller"]) {
      const out = mergeAdjacentPersons(
        t,
        [person(t, "Claire", 0.45), person(t, "Müller", 0.4)],
        ctx,
      );
      expect(out, t).toEqual([]);
    }
  });

  it("ignore les autres types et les détections isolées", () => {
    const t = "Claire Genève";
    const loc: Detection = { ...person(t, "Genève", 0.6), entityType: "LOCATION" };
    expect(mergeAdjacentPersons(t, [person(t, "Claire", 0.45), loc], ctx)).toEqual([]);
  });

  it("ne cite aucune valeur dans l'explication", () => {
    const t = "Claire Müller";
    const out = mergeAdjacentPersons(t, [person(t, "Claire", 0.45), person(t, "Müller", 0.4)], ctx);
    expect(JSON.stringify(out)).not.toMatch(/Claire|Müller/);
  });

  it("source mixte : recognizerId neutre, source et packId du premier élément", () => {
    const t = "Claire Müller";
    const ner: Detection = {
      ...person(t, "Müller", 0.9),
      recognizerId: "ner/fake",
      packId: "ner",
      source: "ner",
    };
    const out = mergeAdjacentPersons(t, [person(t, "Claire", 0.45), ner], ctx);
    expect(out).toHaveLength(1);
    expect(out[0]!.recognizerId).toBe("core/adjacent-persons");
    expect(out[0]!.source).toBe("dictionary");
    expect(out[0]!.packId).toBe("lang-fr-en");
  });

  it("même source : garde le recognizerId du premier", () => {
    const t = "Claire Müller";
    const out = mergeAdjacentPersons(t, [person(t, "Claire", 0.45), person(t, "Müller", 0.4)], ctx);
    expect(out[0]!.recognizerId).toBe("lang-fr-en/prenoms");
  });
});
