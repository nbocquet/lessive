import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import type { AnalysisContext } from "../core/types/index.ts";
import {
  LOCAL_MODEL_ID,
  createLocalModelCache,
  localModelFileName,
  type LocalModelFileSource,
} from "./local-files.ts";
import { TransformersNerEngine } from "./transformers-engine.ts";

const MODEL_DIR =
  "/mnt/user-data/uploads/lessive/models/Xenova/distilbert-base-multilingual-cased-ner-hrl/";
const hasModel = existsSync(`${MODEL_DIR}onnx/model_quantized.onnx`);

describe("cache de fichiers locaux", () => {
  it("retrouve le nom du fichier dans les clés de Transformers.js", () => {
    const rel = "config.json";
    expect(localModelFileName(`/models/${LOCAL_MODEL_ID}/${rel}`)).toBe(rel);
    expect(localModelFileName(`${LOCAL_MODEL_ID}/onnx/model_quantized.onnx`)).toBe(
      "onnx/model_quantized.onnx",
    );
    expect(
      localModelFileName(`https://huggingface.co/${LOCAL_MODEL_ID}/resolve/main/tokenizer.json`),
    ).toBe("tokenizer.json");
    expect(localModelFileName("https://huggingface.co/autre/modele/resolve/main/x.json")).toBe(
      undefined,
    );
  });

  it("répond depuis la source, ignore put et ne connaît que son modèle", async () => {
    const asked: string[] = [];
    const source: LocalModelFileSource = (name) => {
      asked.push(name);
      return name === "config.json" ? new Response("{}") : undefined;
    };
    const cache = createLocalModelCache(source);
    expect(await (await cache.match(`/m/${LOCAL_MODEL_ID}/config.json`))?.text()).toBe("{}");
    expect(await cache.match(`/m/${LOCAL_MODEL_ID}/absent.json`)).toBeUndefined();
    expect(await cache.match("/ailleurs/config.json")).toBeUndefined();
    await cache.put("x", new Response("y"));
    expect(asked).toEqual(["config.json", "absent.json"]);
  });
});

const makeCtx = (): AnalysisContext => {
  let n = 0;
  return { nextId: () => `d${++n}` };
};

// Preuve du mécanisme retenu (ADR 0003) : mêmes octets que ceux que l'utilisateur choisit, lus par le
// cache personnalisé. Un tokenizer absent ferait échouer le pipeline (« this.tokenizer is not a function »).
describe.skipIf(!hasModel)(
  "TransformersNerEngine : fichiers fournis par l'utilisateur (lent)",
  () => {
    it(
      "charge le modèle par customCache et localise une personne",
      { timeout: 120_000 },
      async () => {
        const asked: string[] = [];
        const source: LocalModelFileSource = async (name) => {
          asked.push(name);
          try {
            const bytes = await readFile(`${MODEL_DIR}${name}`);
            return new Response(bytes, { headers: { "content-length": String(bytes.length) } });
          } catch {
            return undefined;
          }
        };
        const engine = new TransformersNerEngine({
          modelFiles: source,
          modelLabel: "test-local",
          device: "cpu",
        });
        try {
          await engine.load();
          expect(asked).toContain("tokenizer.json");
          expect(asked).toContain("tokenizer_config.json");
          expect(asked).toContain("onnx/model_quantized.onnx");
          const text = "Bonjour, je suis Claire Dubois et j'habite à Nyon.";
          const detections = await engine.recognize(text, makeCtx());
          const person = detections.find((d) => d.entityType === "PERSON");
          expect(person).toBeDefined();
          expect(text.slice(person?.start, person?.end)).toBe("Claire Dubois");
          expect(person?.recognizerId).toBe("ner/test-local");
        } finally {
          await engine.dispose();
        }
      },
    );
  },
);
