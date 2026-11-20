/** Plages à mois partagé (#14), données synthétiques uniquement. */
import { describe, expect, it } from "vitest";
import {
  createAnalyzer,
  createSession,
  PackRegistry,
  reidentify,
  transform,
} from "../../src/core/index.ts";
import { bundledPackDirs, loadPackDir } from "../../packs/_tools/load.ts";

function makeAnalyzer(dates = true) {
  const registry = new PackRegistry();
  for (const dir of bundledPackDirs()) registry.register(loadPackDir(dir));
  registry.setPackEnabled("dates", dates);
  return createAnalyzer(registry.activeRules());
}
const analyzer = makeAnalyzer();

describe("plages et dates coordonnées (#14)", () => {
  it.each([
    ["du 7 au 11 octobre", " inclus"],
    ["du 16 au 20 novembre", ""],
    ["les 23 et 24 novembre", ""],
    ["du 1er au 3 février 2027", ""],
  ])("remplace toute l’expression %s dans les deux modes", async (value, suffix) => {
    const text = `😀 ${value}${suffix}. Puis ${value}.`;
    const result = await analyzer.analyze(text, { language: "fr" });
    expect(result.detections.map((d) => [d.entityType, text.slice(d.start, d.end)])).toEqual([
      ["DATE", value],
      ["DATE", value],
    ]);
    expect(result.detections[0]?.start).toBe(3);
    const session = createSession();
    const pseudo = transform(
      text,
      result.detections,
      { mode: "pseudonymization", defaultOperator: "pseudonymize" },
      session,
    );
    expect(pseudo.errors).toEqual([]);
    expect(pseudo.text).toBe(`😀 DATE_001${suffix}. Puis DATE_001.`);
    expect(reidentify(pseudo.text, session).text).toBe(text);
    const masked = transform(text, result.detections, {
      mode: "masking",
      defaultOperator: "categorize",
    });
    expect(masked.text).toBe(`😀 [DATE]${suffix}. Puis [DATE].`);
  });

  it("laisse les dates visibles lorsque le pack est désactivé", async () => {
    const result = await makeAnalyzer(false).analyze("du 7 au 11 octobre", { language: "fr" });
    expect(result.detections).toEqual([]);
  });
});
