/** Ordres administratifs des noms (#36), exemples synthétiques sans modèle NER. */
import { describe, expect, it } from "vitest";
import {
  createAnalyzer,
  createSession,
  PackRegistry,
  reidentify,
  transform,
} from "../../src/core/index.ts";
import { bundledPackDirs, loadPackDir } from "../../packs/_tools/load.ts";

const registry = new PackRegistry();
for (const dir of bundledPackDirs()) registry.register(loadPackDir(dir));
const analyzer = createAnalyzer(registry.activeRules());

describe("noms inversés : détection et correspondances (#36)", () => {
  it("réunit les deux formes entières dans l’exemple administratif de l’issue", async () => {
    const text = "Jean Dupont a signé le bail. Locataire : DUPONT Jean.";
    const result = await analyzer.analyze(text, { language: "fr" });
    const names = result.detections.map((d) => text.slice(d.start, d.end));
    expect(names).toContain("Jean Dupont");
    expect(names).toContain("DUPONT Jean");
    const output = transform(
      text,
      result.detections,
      { mode: "pseudonymization", defaultOperator: "pseudonymize" },
      createSession(),
    );
    expect(output.text).toMatch(/^PERSONNE_001 .*Locataire : PERSONNE_001\.$/u);
  });

  it.each([
    ["Jean Dupont", "DUPONT Jean"],
    ["DUPONT Jean", "Jean Dupont"],
    ["Claire Martin", "MARTIN Claire"],
  ])("protège %s et %s en entier avec le même repère", async (first, reversed) => {
    const text = `😀 ${first} confirme. Locataire : ${reversed}.`;
    const result = await analyzer.analyze(text, { language: "fr" });
    expect(result.detections.map((d) => [d.entityType, text.slice(d.start, d.end)])).toEqual([
      ["PERSON", first],
      ["PERSON", reversed],
    ]);
    expect(result.detections[0]?.start).toBe(3);
    const session = createSession();
    const output = transform(
      text,
      result.detections,
      { mode: "pseudonymization", defaultOperator: "pseudonymize" },
      session,
    );
    expect(output.text).toBe("😀 PERSONNE_001 confirme. Locataire : PERSONNE_001.");
    expect(session.entities()).toHaveLength(1);
    expect(session.entities()[0]?.needsReview).toBe(true);
    expect(reidentify(output.text, session).text).toBe(
      `😀 ${first} confirme. Locataire : ${first}.`,
    );
    expect(
      transform(text, result.detections, { mode: "masking", defaultOperator: "categorize" }).text,
    ).toBe("😀 [PERSONNE] confirme. Locataire : [PERSONNE].");
  });
});
