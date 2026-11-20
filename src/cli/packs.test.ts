import { describe, expect, it } from "vitest";
import { createAnalyzer } from "../core/analyzer/index.ts";
import { transform } from "../core/transform/index.ts";
import type { Language } from "../core/types/index.ts";
import { loadRules } from "./packs.ts";

async function mask(text: string, dates = false, language?: Language): Promise<string> {
  const analyzer = createAnalyzer(await loadRules(dates));
  const result = await analyzer.analyze(text, { language });
  return transform(text, result.detections, { mode: "masking", defaultOperator: "categorize" })
    .text;
}

describe("packs distribués au CLI", () => {
  it("charge les règles actives de chaque pack sauf dates par défaut", async () => {
    const rules = await loadRules(false);
    expect(new Set(rules.map((rule) => rule.packId))).toEqual(
      new Set(["global", "country-ch", "country-fr", "lang-fr-en"]),
    );
    expect(rules.every(({ rule }) => rule.enabled !== false)).toBe(true);
  });

  it("réutilise les catégories du moteur", async () => {
    expect(await mask("probe@example.org 192.0.2.123")).toBe("[EMAIL] [IP]");
  });

  it("conserve les dates par défaut et les active explicitement", async () => {
    expect(await mask("2024-02-16")).toBe("2024-02-16");
    expect(await mask("2024-02-16", true)).toBe("[DATE]");
  });

  it("applique le filtre de langue seulement quand il est renseigné", async () => {
    const text = "16 février 2024 ; February 16, 2024";
    expect(await mask(text, true, "fr")).toBe("[DATE] ; February 16, 2024");
    expect(await mask(text, true, "en")).toBe("16 février 2024 ; [DATE]");
    expect(await mask(text, true)).toBe("[DATE] ; [DATE]");
  });
});
