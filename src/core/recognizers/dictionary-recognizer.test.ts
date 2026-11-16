import { describe, expect, it } from "vitest";
import { MAX_INPUT_LENGTH, type AnalysisContext, type DictionaryRule } from "../types/index.ts";
import { DictionaryRecognizer } from "./dictionary-recognizer.ts";
import { AbortError } from "./errors.ts";

function makeCtx(signal?: AbortSignal): AnalysisContext {
  let n = 0;
  return { nextId: () => `d${++n}`, signal };
}

const rule = (terms: string[], over: Partial<DictionaryRule> = {}): DictionaryRule => ({
  kind: "dictionary",
  id: "names",
  entityType: "PERSON",
  score: 0.6,
  terms,
  ...over,
});

async function found(terms: string[], text: string, over: Partial<DictionaryRule> = {}) {
  const r = new DictionaryRecognizer(rule(terms, over), "pk");
  const ds = await r.analyze(text, makeCtx());
  return ds.map((d) => text.slice(d.start, d.end));
}

describe("DictionaryRecognizer", () => {
  it("renseigne la détection sans citer le terme", async () => {
    const r = new DictionaryRecognizer(rule(["Anne"]), "pk");
    const [d] = await r.analyze("Bonjour Anne", makeCtx());
    expect(d).toMatchObject({
      start: 8,
      end: 12,
      entityType: "PERSON",
      score: 0.6,
      recognizerId: "pk/names",
      packId: "pk",
      source: "dictionary",
    });
    expect(d?.explanation.join(" ")).not.toContain("Anne");
  });

  it("ignore casse et accents", async () => {
    expect(await found(["Hélène"], "HELENE et helene et hélène et Hélène")).toHaveLength(4);
    expect(await found(["Helene"], "Hélène")).toEqual(["Hélène"]);
  });

  it("ne trouve pas un mot dans un autre mot", async () => {
    expect(await found(["Anne"], "Annecy, Joanne, Anne2, Annette")).toEqual([]);
    expect(await found(["Anne"], "Annecy et Anne")).toEqual(["Anne"]);
  });

  it("gère les apostrophes françaises", async () => {
    expect(await found(["Anne"], "le livre d'Anne et l’amie d’Anne")).toEqual(["Anne", "Anne"]);
    expect(await found(["Éric"], "l'Éric")).toEqual(["Éric"]);
  });

  it("gère un terme avec apostrophe", async () => {
    expect(await found(["O'Brien"], "M. O’Brien et O'BRIEN")).toEqual(["O’Brien", "O'BRIEN"]);
  });

  it("gère les termes multi-mots, séparateurs souples", async () => {
    const terms = ["Jean Dupont", "Saint-Julien-en-Genevois"];
    expect(await found(terms, "Jean  Dupont, Jean\nDupont et saint julien en genevois")).toEqual([
      "Jean  Dupont",
      "Jean\nDupont",
      "saint julien en genevois",
    ]);
    expect(await found(terms, "Jean, Dupont")).toEqual([]);
    expect(await found(terms, "Jean Dupontel")).toEqual([]);
  });

  it("privilégie le terme le plus long et ne chevauche pas", async () => {
    expect(await found(["Jean", "Jean Dupont", "Dupont"], "Jean Dupont")).toEqual(["Jean Dupont"]);
    expect(await found(["Jean Dupont", "Dupont Martin"], "Jean Dupont Martin")).toEqual([
      "Jean Dupont",
    ]);
    // pas de terme plus long possible : repli sur le terme court
    expect(await found(["Jean", "Jean Dupont"], "Jean Martin")).toEqual(["Jean"]);
  });

  it("donne des positions exactes dans l'original (accents, emojis, décomposés, œ)", async () => {
    const text = "😀 Éloïse café cœur Zoé puis Anne";
    const r = new DictionaryRecognizer(rule(["Anne", "Zoé", "cœur"]), "pk");
    const ds = await r.analyze(text, makeCtx());
    expect(ds.map((d) => text.slice(d.start, d.end))).toEqual(["cœur", "Zoé", "Anne"]);
  });

  it("respecte caseSensitive tout en restant insensible aux accents", async () => {
    expect(await found(["Marie"], "Marie marie MARIE", { caseSensitive: true })).toEqual(["Marie"]);
    expect(await found(["Zoé"], "Zoe zoe", { caseSensitive: true })).toEqual(["Zoe"]);
  });

  it("ignore les termes vides ou sans mot, et les doublons", async () => {
    expect(await found(["", "  ", "--", "Anne", "anne"], "Anne")).toEqual(["Anne"]);
  });

  it("traite plusieurs milliers de termes rapidement", async () => {
    const terms = Array.from({ length: 20000 }, (_, i) => `Prénom${i} Nom${i}`);
    terms.push("saint julien");
    const r = new DictionaryRecognizer(rule(terms), "pk");
    const text = "Le prénom123 nom123 voisin de Saint Julien. ".repeat(2000).slice(0, 150_000);
    const t0 = performance.now();
    const ds = await r.analyze(text, makeCtx());
    expect(performance.now() - t0).toBeLessThan(2000);
    expect(ds.length).toBeGreaterThan(3000);
  });

  it("refuse un texte trop long", async () => {
    const r = new DictionaryRecognizer(rule(["a"]), "pk");
    await expect(r.analyze("a".repeat(MAX_INPUT_LENGTH + 1), makeCtx())).rejects.toThrow(
      RangeError,
    );
  });

  it("lève AbortError sur annulation", async () => {
    const r = new DictionaryRecognizer(rule(["a"]), "pk");
    const ac = new AbortController();
    ac.abort();
    await expect(r.analyze("a a a", makeCtx(ac.signal))).rejects.toBeInstanceOf(AbortError);
  });

  it("vérifie le signal pendant le parcours", async () => {
    const r = new DictionaryRecognizer(rule(["a"]), "pk");
    const ac = new AbortController();
    let n = 0;
    const ctx: AnalysisContext = {
      signal: ac.signal,
      nextId: () => {
        if (++n === 5) ac.abort();
        return `d${n}`;
      },
    };
    await expect(r.analyze("a ".repeat(1000), ctx)).rejects.toBeInstanceOf(AbortError);
  });
});
