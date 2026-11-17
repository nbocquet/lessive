import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { AnalysisContext } from "../core/types/index.ts";
import { DEFAULT_NER_MODEL, TransformersNerEngine } from "./transformers-engine.ts";

// Dossier des modèles déposé à la main (voir CLAUDE.md, « Environnement des agents »).
const MODELS_DIR = "/mnt/user-data/uploads/lessive/models/";
const WEIGHTS = `${MODELS_DIR}${DEFAULT_NER_MODEL}/onnx/model_quantized.onnx`;
const hasModel = existsSync(WEIGHTS);

const makeCtx = (signal?: AbortSignal): AnalysisContext => {
  let n = 0;
  return { signal, nextId: () => `d${++n}` };
};

describe("TransformersNerEngine", () => {
  it("n'appelle pas le réseau et refuse de reconnaître avant load()", async () => {
    const engine = new TransformersNerEngine();
    await expect(engine.recognize("Bonjour", makeCtx())).rejects.toThrow(/charg/);
    await engine.dispose(); // sans effet, sans erreur
  });
});

// Test lent : charge le vrai modèle (≈ 135 Mo) sous Node avec onnxruntime-node.
describe.skipIf(!hasModel)("TransformersNerEngine : modèle réel (lent)", () => {
  it(
    "trouve les personnes avec des positions exactes sur 3 phrases fr/en",
    { timeout: 120_000 },
    async () => {
      const engine = new TransformersNerEngine({ localModelPath: MODELS_DIR, device: "cpu" });
      const progress: number[] = [];
      try {
        await engine.load((p) => progress.push(p));
        expect(progress.at(-1)).toBe(1);
        expect(progress.every((p, i) => i === 0 || p >= (progress[i - 1] as number))).toBe(true);

        const cases: { text: string; persons: string[]; locations: string[] }[] = [
          {
            text: "Bonjour, je suis Claire Dubois et j'habite à Nyon. Écrivez à Jean-Marc Favre.",
            persons: ["Claire Dubois", "Jean-Marc Favre"],
            locations: ["Nyon"],
          },
          {
            text: "🎉 Merci Camille Béguelin et Marc Rochat pour votre aide ! 😊",
            persons: ["Camille Béguelin", "Marc Rochat"],
            locations: [],
          },
          {
            text: "Please forward this to Michael Johnson, who works in London.",
            persons: ["Michael Johnson"],
            locations: ["London"],
          },
        ];
        for (const c of cases) {
          const detections = await engine.recognize(c.text, makeCtx());
          for (const d of detections) {
            expect(d.source).toBe("ner");
            expect(d.packId).toBe("ner");
            expect(d.recognizerId).toBe(`ner/${DEFAULT_NER_MODEL}`);
            expect(d.score).toBeGreaterThanOrEqual(0.5);
          }
          const values = (type: string) =>
            detections
              .filter((d) => d.entityType === type)
              .map((d) => c.text.slice(d.start, d.end));
          expect(values("PERSON")).toEqual(c.persons);
          expect(values("LOCATION")).toEqual(c.locations);
        }

        // Texte long : plusieurs segments, positions toujours exactes sur le texte complet.
        const sentence = "Claire Dubois a écrit à Marie Curie depuis Nyon. ";
        const long = sentence.repeat(60).trim();
        const detections = await engine.recognize(long, makeCtx());
        // Le modèle étiquette parfois « Marie Curie » en organisation : on vérifie les positions
        // de toutes les détections et la présence de « Claire Dubois » dans presque chaque phrase.
        for (const d of detections) {
          expect(["Claire Dubois", "Marie Curie", "Nyon"]).toContain(long.slice(d.start, d.end));
        }
        const claire = detections.filter(
          (d) => d.entityType === "PERSON" && long.slice(d.start, d.end) === "Claire Dubois",
        );
        expect(claire.length).toBeGreaterThanOrEqual(58);
        expect(detections.length).toBeGreaterThanOrEqual(170);

        // Annulation : signal déjà annulé.
        const controller = new AbortController();
        controller.abort();
        await expect(engine.recognize(long, makeCtx(controller.signal))).rejects.toMatchObject({
          name: "AbortError",
        });
      } finally {
        await engine.dispose();
      }
    },
  );
});
