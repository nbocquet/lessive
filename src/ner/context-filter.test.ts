import { describe, expect, it } from "vitest";
import { filterContextualFalsePositives } from "./context-filter.ts";
import { recognizeSegments, type NerEntityType, type NerSpan } from "./postprocess.ts";
import { fakeClassifier } from "./test-helpers.ts";

function span(text: string, value: string, entityType: NerEntityType = "ORGANIZATION"): NerSpan {
  const start = text.indexOf(value);
  expect(start).toBeGreaterThanOrEqual(0);
  return { start, end: start + value.length, entityType, score: 0.9, approximate: false };
}

describe("filtre contextuel du NER (#15, #32)", () => {
  it.each(["Madame, Monsieur,", "Mesdames, Messieurs,", "Madame, Monsieur\r\n"])(
    "préserve la formule d’appel %s, y compris un groupe unique",
    (text) => {
      const words = text.match(/\p{L}+/gu) ?? [];
      expect(
        filterContextualFalsePositives(
          text,
          words.map((w) => span(text, w, "PERSON")),
        ),
      ).toEqual([]);
      expect(filterContextualFalsePositives(text, [span(text, text.trim(), "PERSON")])).toEqual([]);
    },
  );

  it("conserve un titre suivi d’un nom et une organisation contenant un titre", () => {
    const text = "Madame Corvelet travaille chez Madame Conseil SAS.";
    const spans = [span(text, "Madame Corvelet", "PERSON"), span(text, "Madame Conseil SAS")];
    expect(filterContextualFalsePositives(text, spans)).toEqual(spans);
    expect(filterContextualFalsePositives(text, [span(text, "Madame", "PERSON")])).toHaveLength(1);
  });

  it.each(["AVS", "NIR", "IBAN", "IDE"])("écarte seulement le libellé %s", (label) => {
    const text = `Numéro ${label}\u00a0: 123456\n${label} Conseil SA`;
    const spans = [span(text, label), span(text, `${label} Conseil SA`)];
    expect(filterContextualFalsePositives(text, spans)).toEqual([spans[1]]);
    const standalone = `L’organisation ${label} recrute.`;
    const org = span(standalone, label);
    expect(filterContextualFalsePositives(standalone, [org])).toEqual([org]);
  });

  it("préserve les organisations sigles suivies de ponctuation ou de chiffres", () => {
    for (const text of [
      "Partenaire AVS : bureau principal",
      "AVS : bureau principal",
      "Partenaire AVS : 2026",
      "AVS 2026",
    ]) {
      const organization = span(text, "AVS");
      expect(filterContextualFalsePositives(text, [organization])).toEqual([organization]);
    }
  });

  it.each(["Ingénieur", "Ingénieure"])("garde la fonction %s systèmes lisible", (title) => {
    const text = `🎉\nSophie Corvelet\r\n${title} systèmes  \r\nHexaTech Conseil SAS`;
    const spans = [
      span(text, "Sophie Corvelet", "PERSON"),
      span(text, title),
      span(text, "HexaTech Conseil SAS"),
    ];
    expect(filterContextualFalsePositives(text, spans)).toEqual([spans[0], spans[2]]);
    expect(text.slice(spans[2]!.start, spans[2]!.end)).toBe("HexaTech Conseil SAS");
  });

  it("ne supprime pas une organisation appelée Madame, ni un titre hors formule d’appel", () => {
    const text = "L’organisation Madame, créée cette année, recrute.";
    const organization = span(text, "Madame");
    expect(filterContextualFalsePositives(text, [organization])).toEqual([organization]);
    const person = span(text, "Madame", "PERSON");
    expect(filterContextualFalsePositives(text, [person])).toEqual([person]);
  });

  it("filtre aussi une fonction détectée d’un bloc", () => {
    const text = "Sophie Corvelet\nIngénieure systèmes\nHexaTech Conseil SAS";
    expect(filterContextualFalsePositives(text, [span(text, "Ingénieure systèmes")])).toEqual([]);
  });

  it("préserve une raison sociale et les mots professionnels en dehors d’une ligne de fonction", () => {
    for (const text of [
      "Ingénieur systèmes SAS",
      "Notre partenaire Ingénieure systèmes intervient.",
    ]) {
      const detection = span(text, text.includes("Ingénieure") ? "Ingénieure" : "Ingénieur");
      expect(filterContextualFalsePositives(text, [detection])).toEqual([detection]);
    }
  });

  it.each(["IT", "IT support"])("laisse %s lisible dans une signature de support", (value) => {
    const text = "IT support, Riverside Analytics Ltd";
    const org = span(text, "Riverside Analytics Ltd");
    expect(filterContextualFalsePositives(text, [span(text, value), org])).toEqual([org]);
  });

  it("préserve IT dans une raison sociale, RH et les noms de salle ou de bâtiment", () => {
    for (const [text, value, type] of [
      ["IT support SA", "IT", "ORGANIZATION"],
      ["L’entreprise IT support recrute.", "IT", "ORGANIZATION"],
      ["RH, HexaTech Conseil SAS", "RH", "ORGANIZATION"],
      ["salle Rhône", "Rhône", "LOCATION"],
      ["bâtiment B", "B", "LOCATION"],
    ] as const) {
      const detection = span(text, value, type);
      expect(filterContextualFalsePositives(text, [detection])).toEqual([detection]);
    }
  });

  it("applique le filtre après la segmentation en conservant les positions UTF-16", async () => {
    const text = "🎉 Un préambule assez long.\nIngénieure systèmes\nHexaTech Conseil SAS";
    const classify = fakeClassifier({
      Ingénieure: "ORG",
      HexaTech: "B-ORG",
      Conseil: "I-ORG",
      SAS: "I-ORG",
    });
    const spans = await recognizeSegments(text, classify, { maxChars: 48, overlap: 12 });
    expect(spans.map((s) => text.slice(s.start, s.end))).toEqual(["HexaTech Conseil SAS"]);
  });
});
