import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { TransformersNerEngine } from "./transformers-engine.ts";

const modelPath = fileURLToPath(new URL("../../models/", import.meta.url));
const modelId = "Xenova/camembert-ner";
const hasModel = existsSync(`${modelPath}${modelId}/onnx/model_quantized.onnx`);

describe.skipIf(!hasModel)("faux positifs : CamemBERT local (#15, #32)", () => {
  it(
    "garde les libellés, la fonction et les véritables sociétés dans les textes synthétiques",
    { timeout: 120_000 },
    async () => {
      const engine = new TransformersNerEngine({
        modelId,
        localModelPath: modelPath,
        device: "cpu",
      });
      await engine.load();
      try {
        let id = 0;
        const ctx = { nextId: () => `d${++id}` };
        for (const text of [
          "Madame, Monsieur,",
          "Mesdames, Messieurs,",
          "Numéro AVS : 756.9217.0769.85",
        ]) {
          expect(await engine.recognize(text, ctx)).toEqual([]);
        }
        const support = "IT support, Riverside Analytics Ltd";
        const supportDetections = await engine.recognize(support, ctx);
        expect(supportDetections.map((d) => [d.entityType, support.slice(d.start, d.end)])).toEqual(
          [["ORGANIZATION", "Riverside Analytics Ltd"]],
        );
        const text = readFileSync(
          new URL("../../tests/regression/fixtures/courriels-migration.md", import.meta.url),
          "utf8",
        );
        const values = (await engine.recognize(text, ctx)).map((d) => text.slice(d.start, d.end));
        expect(values).not.toContain("Ingénieure");
        expect(values).not.toContain("Ingénieure systèmes");
        expect(values).toContain("HexaTech Conseil SAS");
        const company = "Notre partenaire Ingénieur Conseil SAS intervient.";
        const companies = await engine.recognize(company, ctx);
        expect(
          companies.some(
            (d) =>
              d.entityType === "ORGANIZATION" &&
              company.slice(d.start, d.end) === "Ingénieur Conseil SAS",
          ),
        ).toBe(true);
      } finally {
        await engine.dispose();
      }
    },
  );
});
