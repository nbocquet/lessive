/** Numéros synthétiques uniquement : formats NIR et protection même sans clé valide. */
import { describe, expect, it } from "vitest";
import { createAnalyzer, createSession, PackRegistry, transform } from "../../src/core/index.ts";
import { bundledPackDirs, loadPackDir } from "../../packs/_tools/load.ts";

const registry = new PackRegistry();
for (const dir of bundledPackDirs()) registry.register(loadPackDir(dir));
const analyzer = createAnalyzer(registry.activeRules());

describe("NIR français : protection sans moteur NER", () => {
  it.each([
    ["1-85-05-78-006-084-91", true],
    ["1.85.05.78.006.084.91", true],
    ["1850578006084", false],
    ["1 85 05 78 006 084 36", false],
    ["1 8505 b78 006 084 36", false],
  ] as const)("protège %s sans prétendre valider un numéro incertain", async (value, validated) => {
    const text = `😀 Numéro de sécurité sociale : ${value}. Fin.`;
    const result = await analyzer.analyze(text, { language: "fr" });
    const detections = result.detections.filter((d) => d.entityType === "FR_NIR");
    expect(detections).toHaveLength(1);
    const detection = detections[0]!;
    expect(text.slice(detection.start, detection.end)).toBe(value);
    expect(Boolean(detection.validated)).toBe(validated);
    for (const mode of ["masking", "pseudonymization"] as const) {
      const output = transform(
        text,
        result.detections,
        { mode, defaultOperator: mode === "masking" ? "categorize" : "pseudonymize" },
        createSession(),
      );
      expect(output.errors).toEqual([]);
      expect(output.text).not.toContain(value);
      expect(output.text.startsWith("😀 Numéro de sécurité sociale : ")).toBe(true);
      expect(output.text.endsWith(". Fin.")).toBe(true);
    }
  });

  it("ne traite pas une référence sans clé et sans contexte comme un NIR", async () => {
    const result = await analyzer.analyze("Référence : 1850578006084.", { language: "fr" });
    expect(result.detections.some((d) => d.entityType === "FR_NIR")).toBe(false);
  });
});
