/**
 * Unités protégées (tickets #8 et #9) : un fragment NER, même très confiant, ne découpe ni une
 * adresse e-mail entière ni une adresse postale réunie par les règles. Textes fictifs (R10).
 */
import { describe, expect, it } from "vitest";
import {
  createAnalyzer,
  createSession,
  PackRegistry,
  reidentify,
  transform,
} from "../../src/core/index.ts";
import type { Detection, EntityType, NerEngine } from "../../src/core/types/index.ts";
import { bundledPackDirs, loadPackDir } from "../../packs/_tools/load.ts";

const registry = new PackRegistry();
for (const dir of bundledPackDirs()) registry.register(loadPackDir(dir));
const analyzer = createAnalyzer(registry.activeRules());

/** Faux NER : renvoie chaque fragment indiqué (première occurrence) au score donné. */
function fakeNer(fragments: readonly (readonly [string, EntityType, number])[]): NerEngine {
  return {
    load: async () => {},
    dispose: async () => {},
    recognize: async (source, ctx) =>
      fragments.map(([value, entityType, score]) => {
        const start = source.indexOf(value);
        return {
          id: ctx.nextId(),
          start,
          end: start + value.length,
          entityType,
          score,
          recognizerId: "ner/fictif",
          packId: "ner",
          source: "ner" as const,
          explanation: [],
        };
      }),
  };
}

async function run(text: string, ner?: NerEngine, manual: Detection[] = []) {
  const result = await analyzer.analyze(text, { language: "fr", manual, ...(ner ? { ner } : {}) });
  const out = {} as Record<"masking" | "pseudonymization", string>;
  for (const mode of ["masking", "pseudonymization"] as const) {
    const t = transform(
      text,
      result.detections,
      { mode, defaultOperator: mode === "masking" ? "categorize" : "pseudonymize" },
      createSession(),
    );
    expect(t.errors).toEqual([]);
    out[mode] = t.text;
  }
  const values = (type: EntityType) =>
    result.detections.filter((d) => d.entityType === type).map((d) => text.slice(d.start, d.end));
  return { result, out, values };
}

describe("e-mail entier protégé (#8)", () => {
  it("un nom NFD rogné garde ses accents dans la correspondance et la réidentification", async () => {
    const name = "Rene\u0301";
    const text = `a@example.org, ${name}`;
    const { result, out, values } = await run(
      text,
      fakeNer([[`example.org, ${name}`, "PERSON", 0.99]]),
    );
    expect(values("PERSON")).toEqual([name]);
    expect(out.pseudonymization).toMatch(/^EMAIL_\d{3}, PERSONNE_\d{3}$/u);
    expect(out.masking).toBe("[EMAIL], [PERSONNE]");
    const session = createSession();
    const transformed = transform(
      text,
      result.detections,
      { mode: "pseudonymization", defaultOperator: "pseudonymize" },
      session,
    );
    expect(session.entities().find((e) => e.entityType === "PERSON")?.surfaceForms).toContain(name);
    expect(reidentify(transformed.text, session).text).toBe(text);
  });

  it.each([
    ["elodie.morel@example.org", "elodie"],
    ["<nina.brumelac@example.org>", "nina"],
    ["<elise.delavarenque@example.org>", "varenque"],
    ["<elise.delavarenque@example.org>", "elise.delavarenque"],
  ])("%s : un fragment %s à 0,99 ne découpe pas l'adresse", async (email, fragment) => {
    const text = `Contactez ${email} pour la suite.`;
    const { values, out } = await run(text, fakeNer([[fragment, "PERSON", 0.99]]));
    expect(values("EMAIL")).toEqual([email.replace(/[<>]/gu, "")]);
    expect(values("PERSON")).toEqual([]);
    for (const mode of ["masking", "pseudonymization"] as const) {
      expect(out[mode]).not.toMatch(/example\.org|elodie|nina|elise/u);
    }
  });

  it("nom affiché + adresse : un jeton PERSONNE et un jeton EMAIL entiers", async () => {
    const text = "Élodie Morel <elodie.morel@example.org>";
    for (const ner of [undefined, fakeNer([["elodie", "PERSON", 0.99]])]) {
      const { values, out } = await run(text, ner);
      expect(values("EMAIL")).toEqual(["elodie.morel@example.org"]);
      expect(values("PERSON")).toEqual(["Élodie Morel"]);
      expect(out.pseudonymization).toMatch(/^PERSONNE_\d{3} <EMAIL_\d{3}>$/u);
      expect(out.masking).not.toMatch(/example|\.morel/u);
    }
  });

  it("la propagation ne crée aucun jeton PERSONNE dans une adresse", async () => {
    const text = "Élodie Morel écrit. Contact : elodie.morel@example.org, morel@example.org.";
    const { values, out } = await run(text);
    expect(values("EMAIL")).toEqual(["elodie.morel@example.org", "morel@example.org"]);
    expect(out.pseudonymization).not.toMatch(/PERSONNE_\d+[.@]|\.PERSONNE/u);
  });
});

describe("adresse postale protégée (#9)", () => {
  it.each([undefined, 0.99])(
    "corriger la rue à la main conserve les détections voisines (NER : %s)",
    async (score) => {
      const text = "18 rue des Mélèzes, 1205 Genève";
      const manual: Detection = {
        id: "manual",
        start: 0,
        end: text.indexOf(","),
        entityType: "LOCATION",
        source: "manual",
        score: 1,
        recognizerId: "manual",
        packId: "manual",
        explanation: [],
      };
      const { result, out } = await run(
        text,
        score === undefined ? undefined : fakeNer([["Genève", "LOCATION", score]]),
        [manual],
      );
      expect(result.detections.some((d) => d.source === "manual")).toBe(true);
      for (const mode of ["masking", "pseudonymization"] as const) {
        expect(out[mode]).not.toMatch(/Mélèzes|Genève/u);
        // Sans conflit NER supplémentaire, la règle code postal + ville reste entière.
        if (score === undefined) expect(out[mode]).not.toContain("1205");
      }
    },
  );

  it("un faux NER `Léman` à 0,99 ne dégrade pas l'adresse complète", async () => {
    const text = "Il habite au 7 avenue du Léman, 74100 Annemasse, France.";
    const { values, out } = await run(text, fakeNer([["Léman", "LOCATION", 0.99]]));
    expect(values("LOCATION")).toContain("7 avenue du Léman, 74100 Annemasse");
    for (const mode of ["masking", "pseudonymization"] as const) {
      expect(out[mode]).not.toMatch(/\b7\b|74100|Léman|Annemasse/u);
    }
  });

  it("les fragments NER dans une adresse d'établissement ne la découpent pas", async () => {
    const text = "situé au 18 rue des Mélèzes, 1205 Genève.";
    const { values, out } = await run(
      text,
      fakeNer([
        ["Mélèzes", "LOCATION", 0.99],
        ["Genève", "LOCATION", 0.99],
      ]),
    );
    expect(values("LOCATION")).toEqual(["18 rue des Mélèzes, 1205 Genève"]);
    expect(out.pseudonymization).toBe("situé au LIEU_001.");
  });

  it("le bloc multiligne garde sa structure et les bornes du code postal", async () => {
    const text = "Siège : 42 avenue des Acacias  \n1227 Carouge  \nSuisse\nFin.";
    const { result, out } = await run(
      text,
      fakeNer([
        ["Acacias", "LOCATION", 0.99],
        ["Carouge", "LOCATION", 0.99],
      ]),
    );
    for (const mode of ["masking", "pseudonymization"] as const) {
      expect(out[mode]).not.toMatch(/42|1227|27|Acacias|Carouge/u);
      expect(out[mode]).toContain("Fin.");
    }
    const loc = result.detections.filter((d) => d.entityType === "LOCATION");
    expect(loc[0]!.start).toBe(text.indexOf("42"));
    expect(loc[0]!.end).toBeGreaterThanOrEqual(text.indexOf("Carouge") + "Carouge".length);
  });

  it("villes citées seules et listes de villes restent distinctes", async () => {
    const text = "Réunions à Genève, Lausanne et Carouge.";
    const { values } = await run(text, fakeNer([["Genève", "LOCATION", 0.9]]));
    const loc = values("LOCATION");
    expect(loc).toContain("Genève");
    expect(loc.some((v) => v.includes("Lausanne") && v.includes("Genève"))).toBe(false);
  });
});
