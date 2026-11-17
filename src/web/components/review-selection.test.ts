import { describe, expect, it } from "vitest";
import {
  MAX_OCCURRENCES,
  boundaryPosition,
  findOccurrences,
  planManualSpans,
  resolveSelection,
  rootBoundaryPosition,
  snapToCodePoints,
} from "./review-selection.ts";

const values = (text: string, needle: string): string[] =>
  findOccurrences(text, needle).ranges.map((r) => text.slice(r.start, r.end));

describe("boundaryPosition", () => {
  it("convertit un décalage de nœud de texte en position absolue", () => {
    expect(boundaryPosition(10, 5, 3, true)).toBe(13);
    expect(boundaryPosition(10, 5, 99, true)).toBe(15);
  });

  it("convertit un rang d'enfant d'un élément en début ou fin de segment", () => {
    expect(boundaryPosition(10, 5, 0, false)).toBe(10);
    expect(boundaryPosition(10, 5, 1, false)).toBe(15);
  });

  it("gère une borne posée sur le conteneur", () => {
    expect(rootBoundaryPosition([0, 4, 9], 12, 1)).toBe(4);
    expect(rootBoundaryPosition([0, 4, 9], 12, 3)).toBe(12);
  });

  it("permet une sélection sur plusieurs nœuds", () => {
    // Texte « ab[cd]ef » découpé en segments [0,2) [2,4) [4,6) : début dans le 1er, fin dans le 3e.
    const a = boundaryPosition(0, 2, 1, true);
    const b = boundaryPosition(4, 2, 1, true);
    expect(resolveSelection("abcdef", a, b)).toEqual({ start: 1, end: 5 });
  });
});

describe("resolveSelection", () => {
  it("ordonne les bornes et retire les espaces de tête et de queue", () => {
    expect(resolveSelection("un Paul Durand ici", 14, 2)).toEqual({ start: 3, end: 14 });
  });

  it("renvoie null pour une sélection vide ou blanche", () => {
    expect(resolveSelection("a   b", 1, 4)).toBeNull();
    expect(resolveSelection("abc", 2, 2)).toBeNull();
  });

  it("borne au texte", () => {
    expect(resolveSelection("abc", -5, 99)).toEqual({ start: 0, end: 3 });
  });

  it("ne coupe jamais une paire de substitution", () => {
    const text = "a😀b";
    expect(snapToCodePoints(text, 2, 2)).toEqual({ start: 1, end: 3 });
    expect(resolveSelection(text, 2, 3)).toEqual({ start: 1, end: 3 });
    expect(resolveSelection(text, 0, 2)).toEqual({ start: 0, end: 3 });
  });

  it("conserve les retours à la ligne internes", () => {
    const text = "Claire\nMartin";
    expect(resolveSelection(text, 0, text.length)).toEqual({ start: 0, end: 13 });
  });
});

describe("findOccurrences", () => {
  it("ignore la casse et respecte les limites de mots", () => {
    expect(values("Martin, Martinez, martin et MARTIN-DUPONT.", "Martin")).toEqual([
      "Martin",
      "martin",
      "MARTIN",
    ]);
  });

  it("traite les lettres accentuées comme des lettres de mot", () => {
    expect(values("Éric et Érica", "Éric")).toEqual(["Éric"]);
    expect(values("été Été", "été")).toEqual(["été", "Été"]);
  });

  it("n'exige pas de limite de mot côté ponctuation", () => {
    expect(values("tel: +41 79 000 00 00.", "+41 79 000 00 00")).toEqual(["+41 79 000 00 00"]);
    expect(values("a.b@x.test, a.b@x.test!", "a.b@x.test")).toHaveLength(2);
  });

  it("assimile retour à la ligne et suite d'espaces", () => {
    expect(values("Claire\nMartin et Claire  Martin", "Claire Martin")).toEqual([
      "Claire\nMartin",
      "Claire  Martin",
    ]);
  });

  it("échappe les caractères spéciaux d'expression régulière", () => {
    expect(values("a+b (c) [d] a+b", "a+b")).toEqual(["a+b", "a+b"]);
    expect(values("x (c) y", "(c)")).toEqual(["(c)"]);
  });

  it("renvoie des positions UTF-16 exactes après des emojis", () => {
    const text = "😀😀 Paul 😀 paul";
    const { ranges } = findOccurrences(text, "Paul");
    expect(ranges).toHaveLength(2);
    for (const r of ranges) expect(text.slice(r.start, r.end).toLowerCase()).toBe("paul");
    expect(ranges[0]?.start).toBe(5);
  });

  it("ne trouve rien pour un motif vide", () => {
    expect(findOccurrences("abc", "  ").ranges).toEqual([]);
  });

  it("plafonne le nombre d'occurrences", () => {
    const text = "a ".repeat(MAX_OCCURRENCES + 50);
    const res = findOccurrences(text, "a");
    expect(res.ranges).toHaveLength(MAX_OCCURRENCES);
    expect(res.truncated).toBe(true);
  });

  it("traite un texte contenant des balises comme du texte", () => {
    expect(values("<script>alert(1)</script> et <b>x</b>", "<script>alert(1)</script>")).toEqual([
      "<script>alert(1)</script>",
    ]);
  });
});

describe("planManualSpans", () => {
  const text = "Claire Martin écrit. Puis claire martin répond. Clairement non.";

  it("propage la sélection à toutes les occurrences", () => {
    const plan = planManualSpans(text, { start: 0, end: 13 }, "", "PERSON", true);
    expect(plan.spans.map((s) => text.slice(s.start, s.end))).toEqual([
      "Claire Martin",
      "claire martin",
    ]);
    expect(plan.spans.every((s) => s.entityType === "PERSON")).toBe(true);
    expect(plan.found).toBe(2);
  });

  it("ajoute seulement la sélection si la propagation est désactivée", () => {
    const plan = planManualSpans(text, { start: 21, end: 34 }, "", "ORGANIZATION", false);
    expect(plan.spans).toEqual([{ start: 21, end: 34, entityType: "ORGANIZATION" }]);
  });

  it("conserve la sélection même hors limites de mots", () => {
    const plan = planManualSpans(text, { start: 0, end: 5 }, "", "PERSON", true);
    // « Clair » : seule la sélection (« Claire » n'est pas un mot entier « Clair »).
    expect(plan.spans).toEqual([{ start: 0, end: 5, entityType: "PERSON" }]);
  });

  it("utilise la saisie au clavier sans sélection", () => {
    const all = planManualSpans(text, null, "claire martin", "PERSON", true);
    expect(all.spans).toHaveLength(2);
    const one = planManualSpans(text, null, "claire martin", "PERSON", false);
    expect(one.spans).toEqual([{ start: 0, end: 13, entityType: "PERSON" }]);
    expect(one.found).toBe(2);
  });

  it("ne renvoie rien si la saisie est introuvable", () => {
    expect(planManualSpans(text, null, "Zorro", "PERSON", true).spans).toEqual([]);
  });
});
