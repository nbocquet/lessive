import { describe, expect, it } from "vitest";
import { PackRegistry, parsePack } from "../registry/index.ts";
import type { AnalysisContext, Detection, NerEngine, Pack } from "../types/index.ts";
import { AbortError } from "../recognizers/index.ts";
import { createAnalyzer } from "./analyzer.ts";

function pack(): Pack {
  const res = parsePack(
    {
      id: "essai",
      version: "1.0.0",
      engineVersion: "0.1.0",
      type: "domain",
      name: "Pack d'essai",
      rules: ["rules/r.json"],
    },
    {
      "rules/r.json": {
        rules: [
          {
            kind: "pattern",
            id: "carte",
            entityType: "CREDIT_CARD",
            score: 0.3,
            pattern: "\\b\\d{4}(?: ?\\d{4}){3}\\b",
            validator: "luhn",
          },
          {
            kind: "pattern",
            id: "code",
            entityType: "SECRET",
            score: 0.3,
            pattern: "\\bZX-\\d{4}\\b",
            context: { words: { fr: ["code"], en: ["code"] } },
          },
          {
            kind: "dictionary",
            id: "villes",
            entityType: "LOCATION",
            score: 0.6,
            terms: ["Lausanne"],
            languages: ["fr"],
          },
        ],
      },
    },
    "0.1.0",
  );
  if (!res.ok) throw new Error(res.errors.join("\n"));
  return res.pack;
}

function analyzer() {
  const reg = new PackRegistry();
  reg.register(pack());
  return createAnalyzer(reg.activeRules());
}

const fakeNer = (spans: Array<[number, number]>): NerEngine => ({
  load: async () => {},
  dispose: async () => {},
  recognize: async (_text: string, ctx: AnalysisContext): Promise<Detection[]> =>
    spans.map(([start, end]) => ({
      id: ctx.nextId(),
      start,
      end,
      entityType: "PERSON",
      score: 0.9,
      recognizerId: "ner/fake",
      packId: "ner",
      source: "ner",
      explanation: ["NER factice"],
    })),
});

describe("createAnalyzer", () => {
  it("applique validateur, contexte, seuil et NER", async () => {
    const text = "Léa paie avec 4111 1111 1111 1111, code ZX-1234, à Lausanne. Ref ZX-9999.";
    const res = await analyzer().analyze(text, { language: "fr", ner: fakeNer([[0, 3]]) });
    const found = res.detections.map((d) => [d.entityType, text.slice(d.start, d.end)]);
    expect(found).toEqual([
      ["PERSON", "Léa"],
      ["CREDIT_CARD", "4111 1111 1111 1111"],
      ["SECRET", "ZX-1234"],
      ["LOCATION", "Lausanne"],
    ]);
    // ZX-9999 sans mot de contexte reste sous le seuil.
    expect(res.discarded.some((d) => text.slice(d.start, d.end) === "ZX-9999")).toBe(true);
    expect(res.warnings).toEqual([]);
  });

  it("filtre les détecteurs par langue", async () => {
    const res = await analyzer().analyze("Lausanne", { language: "en" });
    expect(res.detections).toEqual([]);
  });

  it("signale l'absence de NER", async () => {
    const res = await analyzer().analyze("rien");
    expect(res.warnings).toHaveLength(1);
    expect(res.warnings[0]).toContain("seules les règles intégrées");
    expect(res.warnings[0]).toContain("peuvent rester en clair");
  });

  it("donne la priorité aux ajouts manuels", async () => {
    const text = "à Lausanne";
    const manual: Detection = {
      id: "m1",
      start: 2,
      end: 10,
      entityType: "ORGANIZATION",
      score: 1,
      recognizerId: "manual",
      packId: "manual",
      source: "manual",
      explanation: ["ajout manuel"],
    };
    const res = await analyzer().analyze(text, { language: "fr", manual: [manual] });
    expect(res.detections.map((d) => d.entityType)).toEqual(["ORGANIZATION"]);
  });

  it("refuse un texte trop long et respecte l'annulation", async () => {
    await expect(analyzer().analyze("a".repeat(200_001))).rejects.toThrow(RangeError);
    const ac = new AbortController();
    ac.abort();
    await expect(analyzer().analyze("texte", { signal: ac.signal })).rejects.toThrow();
  });

  it("ne met aucune valeur originale dans les explications ni les avertissements", async () => {
    const text = "carte 4111 1111 1111 1111 à Lausanne";
    const res = await analyzer().analyze(text, { language: "fr" });
    const dump = JSON.stringify(res);
    expect(dump).not.toContain("4111 1111");
    expect(dump).not.toContain("Lausanne");
  });

  const manualAt = (start: number, end: number, id = "m1"): Detection => ({
    id,
    start,
    end,
    entityType: "ORGANIZATION",
    score: 1,
    recognizerId: "manual",
    packId: "manual",
    source: "manual",
    explanation: ["ajout manuel"],
  });

  it("rejette les détections manuelles aux bornes invalides, sans valeur dans le message", async () => {
    const text = "secret 😀 fin";
    const bad: Array<[number, number]> = [
      [0, text.length + 1],
      [-1, 3],
      [3, 3],
      [5, 2],
      [0.5, 3],
      [8, 9], // coupe la paire de substitution (début)
      [0, 8], // coupe la paire de substitution (fin)
    ];
    for (const [s, e] of bad) {
      const err = await analyzer()
        .analyze(text, { manual: [manualAt(s, e)] })
        .catch((x: unknown) => x);
      expect(err, `${s}-${e}`).toBeInstanceOf(RangeError);
      expect((err as Error).message).not.toContain("secret");
    }
    const ok = await analyzer().analyze(text, { manual: [manualAt(7, 9)] });
    expect(ok.detections).toHaveLength(1);
  });

  it("réattribue des identifiants uniques aux détections manuelles", async () => {
    const text = "à Lausanne, Zurich";
    const res = await analyzer().analyze(text, {
      language: "fr",
      manual: [manualAt(12, 18, "d1"), manualAt(0, 1, "d1")],
    });
    const ids = [...res.detections, ...res.discarded].map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    const manual = res.detections.filter((d) => d.source === "manual");
    expect(manual.map((d) => d.id).sort()).toEqual(["m1", "m2"]);
  });

  it("NER en échec : avertissement et détections par règles conservées", async () => {
    const ner: NerEngine = {
      load: async () => {},
      dispose: async () => {},
      recognize: async () => {
        throw new Error("boum");
      },
    };
    const res = await analyzer().analyze("à Lausanne", { language: "fr", ner });
    expect(res.detections.map((d) => d.entityType)).toEqual(["LOCATION"]);
    expect(res.warnings).toHaveLength(1);
    expect(res.warnings[0]).toContain("reconnaissance des noms a échoué");
    expect(res.warnings[0]).not.toContain("boum");
  });

  it("relaie une AbortError venue du NER", async () => {
    const ner: NerEngine = {
      load: async () => {},
      dispose: async () => {},
      recognize: async () => {
        throw new AbortError();
      },
    };
    await expect(analyzer().analyze("à Lausanne", { language: "fr", ner })).rejects.toMatchObject({
      name: "AbortError",
    });
  });

  it("minScore : relève ou abaisse le seuil", async () => {
    const text = "à Lausanne"; // LOCATION à 0,6
    const low = await analyzer().analyze(text, { language: "fr", minScore: 0.5 });
    expect(low.detections).toHaveLength(1);
    const high = await analyzer().analyze(text, { language: "fr", minScore: 0.7 });
    expect(high.detections).toEqual([]);
    expect(high.discarded).toHaveLength(1);
  });
});
