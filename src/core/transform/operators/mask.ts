import type { Operator } from "../../types/index.ts";

/** Ce dont on a besoin d'un segmenteur : `Intl.Segmenter` y répond. */
export interface GraphemeSegmenter {
  segment(input: string): Iterable<{ segment: string }>;
}

let cachedSegmenter: GraphemeSegmenter | null | undefined;

/** Segmenteur de graphèmes si l'environnement en fournit un, sinon `null`. */
function defaultSegmenter(): GraphemeSegmenter | null {
  if (cachedSegmenter === undefined) {
    cachedSegmenter =
      typeof Intl !== "undefined" && typeof Intl.Segmenter === "function"
        ? new Intl.Segmenter(undefined, { granularity: "grapheme" })
        : null;
  }
  return cachedSegmenter;
}

/**
 * Remplace chaque caractère visible (graphème) par « * » et conserve les
 * espaces. Sans `Intl.Segmenter` (`segmenter = null`), on compte les points de
 * code : un accent combinant ou un emoji composé compte alors pour plusieurs.
 */
export function maskValue(
  value: string,
  segmenter: GraphemeSegmenter | null = defaultSegmenter(),
): string {
  const units: Iterable<string> = segmenter
    ? (function* () {
        for (const s of segmenter.segment(value)) yield s.segment;
      })()
    : Array.from(value);
  let out = "";
  for (const unit of units) out += /^\s+$/u.test(unit) ? unit : "*";
  return out;
}

/** Masque la valeur : autant de « * » que de caractères visibles, espaces conservés. */
export const maskOperator: Operator = {
  id: "mask",
  apply: ({ value }) => maskValue(value),
};
