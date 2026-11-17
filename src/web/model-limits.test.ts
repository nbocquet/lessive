import { describe, expect, it } from "vitest";
import {
  checkModelSizes,
  MAX_MODEL_JSON_BYTES,
  MAX_MODEL_ONNX_BYTES,
  MAX_MODEL_TOTAL_BYTES,
  MAX_TOKENIZER_BYTES,
} from "./model-limits.ts";

describe("plafonds des fichiers du modèle", () => {
  it.each([
    ["config.json", MAX_MODEL_JSON_BYTES],
    ["tokenizer_config.json", MAX_MODEL_JSON_BYTES],
    ["special_tokens_map.json", MAX_MODEL_JSON_BYTES],
    ["tokenizer.json", MAX_TOKENIZER_BYTES],
    ["onnx/model_quantized.onnx", MAX_MODEL_ONNX_BYTES],
    ["onnx/model.onnx", MAX_MODEL_ONNX_BYTES],
  ])("accepte le plafond de %s et refuse un octet de plus", (name, limit) => {
    expect(checkModelSizes([{ name, size: limit }])).toBeNull();
    expect(checkModelSizes([{ name, size: limit + 1 }])).toContain("trop volumineux");
  });

  it("borne aussi le total de fichiers individuellement acceptables", () => {
    const files = [
      { name: "onnx/model_quantized.onnx", size: MAX_MODEL_ONNX_BYTES },
      { name: "onnx/model.onnx", size: MAX_MODEL_TOTAL_BYTES - MAX_MODEL_ONNX_BYTES },
    ];
    expect(checkModelSizes(files)).toBeNull();
    files[1]!.size++;
    expect(checkModelSizes(files)).toContain("550 Mio au total");
  });

  it("refuse les doublons, les noms inconnus et les tailles invalides", () => {
    const file = { name: "config.json", size: 10 };
    expect(checkModelSizes([file, file])).not.toBeNull();
    expect(checkModelSizes([{ name: "autre.json", size: 10 }])).not.toBeNull();
    for (const size of [0, -1, NaN, Infinity, 1.5]) {
      expect(checkModelSizes([{ ...file, size }])).not.toBeNull();
    }
  });
});
