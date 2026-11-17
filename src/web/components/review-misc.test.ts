import { describe, expect, it } from "vitest";
import { ENTITY_TYPES } from "../../core/index.ts";
import { checkImportFile, normalizeImportedText } from "./review-import.ts";
import { TYPE_NAMES, excerpt, operatorsForMode, typeToken } from "./review-labels.ts";

describe("review-import", () => {
  it("accepte .txt et .md, refuse le reste", () => {
    expect(checkImportFile("note.TXT", 10)).toBeNull();
    expect(checkImportFile("lisez-moi.md", 10)).toBeNull();
    expect(checkImportFile("image.png", 10)).toMatch(/Format non pris en charge/);
  });

  it("refuse un fichier trop volumineux sans citer son contenu", () => {
    expect(checkImportFile("a.txt", 10_000_000)).toMatch(/trop volumineux/);
  });

  it("retire le BOM et uniformise les fins de ligne", () => {
    expect(normalizeImportedText("\uFEFFa\r\nb\rc\n")).toBe("a\nb\nc\n");
  });
});

describe("review-labels", () => {
  it("nomme tous les types et leur donne un repère visuel distinct", () => {
    const seen = new Set<string>();
    for (const t of ENTITY_TYPES) {
      expect(TYPE_NAMES[t].length).toBeGreaterThan(0);
      const tok = typeToken(t);
      seen.add(`${tok.hue}/${tok.underline}`);
    }
    expect(seen.size).toBe(ENTITY_TYPES.length);
  });

  it("n'offre pseudonymize qu'en pseudonymisation", () => {
    expect(operatorsForMode("masking")).not.toContain("pseudonymize");
    expect(operatorsForMode("pseudonymization")).toContain("pseudonymize");
  });

  it("raccourcit les extraits", () => {
    expect(excerpt("a\n b", 10)).toBe("a b");
    expect(excerpt("x".repeat(50), 10)).toHaveLength(10);
  });
});
