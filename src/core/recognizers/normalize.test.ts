import { describe, expect, it } from "vitest";
import { foldText, tokenizeWords } from "./normalize.ts";

/** Cherche `needle` dans la copie et renvoie le texte original correspondant. */
function originalOf(text: string, needle: string): string {
  const f = foldText(text);
  const i = f.text.indexOf(needle);
  expect(i).toBeGreaterThanOrEqual(0);
  const s = f.toOriginal(i, i + needle.length);
  return text.slice(s.start, s.end);
}

describe("foldText", () => {
  it("met en minuscules et retire les accents", () => {
    expect(foldText("Élève Çà").text).toBe("eleve ca");
  });

  it("garde la casse si demandé, en retirant les accents", () => {
    expect(foldText("Élève", { lowerCase: false }).text).toBe("Eleve");
  });

  it("ramène un intervalle à l'original avec é et ç", () => {
    expect(originalOf("Voici François Dupré ici", "francois dupre")).toBe("François Dupré");
  });

  it("gère œ et Œ (deux unités pour un seul)", () => {
    const t = "Mon cœur et ŒUVRE";
    expect(foldText(t).text).toBe("mon coeur et oeuvre");
    expect(originalOf(t, "coeur")).toBe("cœur");
    expect(originalOf(t, "oeuvre")).toBe("ŒUVRE");
    // une correspondance partielle de la forme développée couvre le caractère entier
    expect(originalOf(t, "co")).toBe("cœ");
  });

  it("gère ß et les ligatures", () => {
    const t = "Straße ﬁn ﬃ";
    expect(foldText(t).text).toBe("strasse fin ffi");
    expect(originalOf(t, "strasse")).toBe("Straße");
    expect(originalOf(t, "fin")).toBe("ﬁn");
    expect(originalOf(t, "ffi")).toBe("ﬃ");
  });

  it("gère les caractères déjà décomposés (e + U+0301)", () => {
    const t = "café noir";
    const f = foldText(t);
    expect(f.text).toBe("cafe noir");
    expect(f.toOriginal(0, 4)).toEqual({ start: 0, end: 5 });
    expect(originalOf(t, "cafe")).toBe("café");
    expect(originalOf(t, "noir")).toBe("noir");
  });

  it("gère les paires de substitution (emojis)", () => {
    const t = "😀😀 Éric 👍";
    const f = foldText(t);
    expect(f.text).toBe("😀😀 eric 👍");
    const i = f.text.indexOf("eric");
    expect(f.toOriginal(i, i + 4)).toEqual({ start: 5, end: 9 });
    expect(t.slice(5, 9)).toBe("Éric");
    const e = f.text.indexOf("👍");
    expect(f.toOriginal(e, e + 2)).toEqual({ start: 10, end: 12 });
  });

  it("gère un emoji composé de plusieurs points de code", () => {
    const t = "👨‍👩‍👧 Zoé";
    expect(originalOf(t, "zoe")).toBe("Zoé");
  });

  it("ne mélange pas les positions quand les longueurs diffèrent beaucoup", () => {
    const t = "œœœ ééé éé Anne";
    expect(originalOf(t, "anne")).toBe("Anne");
  });

  it("gère les intervalles vides et les bornes", () => {
    const f = foldText("Éa");
    expect(f.toOriginal(1, 1)).toEqual({ start: 1, end: 1 });
    expect(f.toOriginal(2, 2)).toEqual({ start: 2, end: 2 });
    expect(() => f.toOriginal(0, 3)).toThrow(RangeError);
    expect(() => f.toOriginal(2, 1)).toThrow(RangeError);
  });

  it("préserve un texte vide", () => {
    expect(foldText("").text).toBe("");
  });

  it("n'abîme pas les marques d'autres écritures", () => {
    expect(foldText("हिन्दी").text).toBe("हिन्दी");
  });

  it("tolère une surrogate isolée", () => {
    const t = "a\ud83db";
    expect(foldText(t).text).toBe("a\ud83db");
  });
});

describe("tokenizeWords", () => {
  it("découpe sur tout ce qui n'est ni lettre ni chiffre", () => {
    expect(tokenizeWords("d'Anne, 12 rue-X").map((t) => t.text)).toEqual([
      "d",
      "Anne",
      "12",
      "rue",
      "X",
    ]);
  });
  it("garde une marque combinante dans le mot", () => {
    expect(tokenizeWords("café x").map((t) => t.text)).toEqual(["café", "x"]);
  });
});
