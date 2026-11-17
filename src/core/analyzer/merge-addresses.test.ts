import { describe, expect, it } from "vitest";
import type { AnalysisContext, Detection } from "../types/index.ts";
import { mergeAddressParts } from "./merge-addresses.ts";

let n = 0;
const ctx: AnalysisContext = { nextId: () => `a${++n}` };

function part(text: string, value: string, recognizerId: string, score = 0.8): Detection {
  const start = text.indexOf(value);
  return {
    id: `p${start}`,
    start,
    end: start + value.length,
    entityType: "LOCATION",
    score,
    recognizerId,
    packId: "country-fr",
    source: "pattern",
    explanation: ["motif"],
  };
}

const slice = (t: string, d: Detection) => t.slice(d.start, d.end);

describe("mergeAddressParts", () => {
  it("réunit rue et code postal séparés par une virgule", () => {
    const t = "Il habite au 7 avenue du Léman, 74100 Annemasse, France.";
    const out = mergeAddressParts(
      t,
      [
        part(t, "7 avenue du Léman", "country-fr/fr-street"),
        part(t, "74100 Annemasse", "country-fr/fr-postal-code-city", 0.85),
      ],
      ctx,
    );
    expect(out.map((d) => slice(t, d))).toEqual(["7 avenue du Léman, 74100 Annemasse"]);
    expect(out[0]!.score).toBeCloseTo(0.95);
    expect(out[0]!.packId).toBe("country-fr");
  });

  it("réunit une adresse sur plusieurs lignes", () => {
    const t = "Alpina SA\n42 avenue des Acacias\n1227 Carouge\nSuisse";
    const out = mergeAddressParts(
      t,
      [
        part(t, "42 avenue des Acacias", "country-ch/street-number-first"),
        part(t, "1227 Carouge", "country-ch/postal-code"),
      ],
      ctx,
    );
    expect(out.map((d) => slice(t, d))).toEqual(["42 avenue des Acacias\n1227 Carouge"]);
  });

  it("ne réunit pas deux villes du NER ni à travers un mot ou une ligne vide", () => {
    const t1 = "Genève, Lausanne";
    const ner = (v: string): Detection => ({ ...part(t1, v, "ner/model"), source: "ner" });
    expect(mergeAddressParts(t1, [ner("Genève"), ner("Lausanne")], ctx)).toEqual([]);
    for (const t of ["7 rue Haute et 1200 Genève", "7 rue Haute\n\n1200 Genève"]) {
      const out = mergeAddressParts(
        t,
        [part(t, "7 rue Haute", "x/street"), part(t, "1200 Genève", "x/postal-code")],
        ctx,
      );
      expect(out, t).toEqual([]);
    }
  });

  it("ne cite aucune valeur dans l'explication", () => {
    const t = "7 avenue du Léman, 74100 Annemasse";
    const out = mergeAddressParts(
      t,
      [part(t, "7 avenue du Léman", "x/street"), part(t, "74100 Annemasse", "x/postal")],
      ctx,
    );
    expect(JSON.stringify(out)).not.toMatch(/Léman|Annemasse/u);
  });
});
