import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { analyze, findStrict } from "./analyzer.mjs";
import { TEXTES_DIR, loadCorpus } from "./corpus.mjs";
import { ENTITY_TYPES, FORMAT_IDS } from "./formats.mjs";
import { pseudonymize } from "./pseudonymize.mjs";

const corpus = loadCorpus();
const words = (s) => s.trim().split(/\s+/).length;

describe("pseudonymize", () => {
  const entities = [
    { type: "PERSON", value: "Claire Martin", surfaces: ["Claire Martin", "Mme Martin", "Claire"] },
    { type: "PERSON", value: "Paul Martin", surfaces: ["M. Martin"] },
    { type: "LOCATION", value: "Nyon", surfaces: ["Nyon"] },
  ];
  const text = "Claire Martin habite à Nyon. Mme Martin et M. Martin ; Claire, Clairement.";

  it("numérote par type et par ordre d'apparition, titres laissés en clair", () => {
    const r = pseudonymize(text, entities, "A");
    expect(r.text).toBe(
      "PERSONNE_001 habite à LIEU_001. Mme PERSONNE_001 et M. PERSONNE_002 ; PERSONNE_001, Clairement.",
    );
    expect(r.table).toEqual({
      PERSONNE_001: "Claire Martin",
      PERSONNE_002: "Paul Martin",
      LIEU_001: "Nyon",
    });
  });
  it("ne remplace pas à l'intérieur d'un mot (Clairement)", () => {
    expect(pseudonymize(text, entities, "B").text).toContain("Clairement");
  });
  it("donne des positions exactes dans le texte produit", () => {
    for (const f of FORMAT_IDS) {
      const r = pseudonymize(text, entities, f);
      for (const o of r.occurrences) expect(r.text.slice(o.start, o.end)).toBe(o.token);
      expect(r.occurrences).toHaveLength(5);
    }
  });
  it("refuse une entité absente du texte et une forme de surface en double", () => {
    expect(() => pseudonymize("Rien", entities, "A")).toThrow(/absente/);
    const dup = [
      { type: "PERSON", value: "a", surfaces: ["Claire"] },
      { type: "PERSON", value: "b", surfaces: ["Claire"] },
    ];
    expect(() => pseudonymize("Claire", dup, "A")).toThrow(/double/);
  });
});

describe("corpus synthétique", () => {
  it("contient cinq textes", () => {
    expect(corpus.map((t) => t.id)).toEqual(["client", "copro", "medical", "reunion", "rh"]);
  });

  it.each(corpus.map((t) => [t.id, t]))("%s : contraintes de forme", (_id, t) => {
    expect(words(t.source)).toBeGreaterThanOrEqual(100);
    expect(words(t.source)).toBeLessThanOrEqual(250);
    expect(t.entities.length).toBeGreaterThanOrEqual(4);
    expect(t.entities.length).toBeLessThanOrEqual(8);
    const r = pseudonymize(t.source, t.entities, "A");
    const counts = {};
    for (const o of r.occurrences) counts[o.token] = (counts[o.token] ?? 0) + 1;
    expect(Object.keys(counts)).toHaveLength(t.entities.length);
    expect(Object.values(counts).some((c) => c > 1)).toBe(true); // au moins une entité répétée
    // Prénom seul : une forme de surface d'une seule initiale majuscule, sans espace, pour une PERSON.
    const hasFirstNameOnly = t.entities.some(
      (e) => e.type === "PERSON" && e.surfaces.some((s) => /^[A-ZÉ][\p{L}-]+$/u.test(s)),
    );
    expect(hasFirstNameOnly).toBe(true);
  });

  it("contient au moins un cas « M. X / Mme X » et couvre tous les types d'entités", () => {
    const surfaces = corpus.flatMap((t) => t.entities.flatMap((e) => e.surfaces));
    expect(surfaces).toContain("M. Bernard");
    expect(surfaces).toContain("Mme Bernard");
    const types = new Set(corpus.flatMap((t) => t.entities.map((e) => e.type)));
    expect([...types].sort()).toEqual([...ENTITY_TYPES].sort());
  });

  it("n'utilise que des données manifestement synthétiques (domaines .example, numéros 555)", () => {
    for (const t of corpus) {
      for (const e of t.entities) {
        if (e.type === "EMAIL") expect(e.value).toMatch(/\.example$/);
        if (e.type === "PHONE" && e.value.startsWith("+41")) expect(e.value).toMatch(/ 555 01 \d\d$/);
      }
    }
  });

  describe.each(corpus.map((t) => [t.id, t]))("%s", (_id, t) => {
    it.each(FORMAT_IDS)("format %s : aucune valeur d'origine ne subsiste", (f) => {
      const { text } = pseudonymize(t.source, t.entities, f);
      for (const e of t.entities) for (const s of e.surfaces) expect(text).not.toContain(s);
    });

    it.each(FORMAT_IDS)("format %s : l'analyseur retrouve tous les jetons, sans inconnu", (f) => {
      const { text, table } = pseudonymize(t.source, t.entities, f);
      const r = analyze(text, { format: f, table });
      expect(r.unknown).toEqual([]);
      expect([...r.found].sort()).toEqual(Object.keys(table).sort());
      expect(r.matches.every((m) => m.variants.length === 0)).toBe(true);
      expect([...findStrict(text, { format: f, table }).keys()].sort()).toEqual(Object.keys(table).sort());
    });

    it.each(FORMAT_IDS)("format %s : le fichier généré est à jour", (f) => {
      const file = join(TEXTES_DIR, `${t.id}.${f}.txt`);
      expect(existsSync(file)).toBe(true);
      expect(readFileSync(file, "utf8")).toBe(pseudonymize(t.source, t.entities, f).text);
    });
  });
});
