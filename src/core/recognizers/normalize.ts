/**
 * Normalisation de recherche : minuscules, sans accents, avec table de
 * correspondance des positions (R7).
 *
 * La copie normalisée n'a pas la même longueur que l'original (NFD, `œ` → `oe`,
 * `ß` → `ss`, marques combinantes supprimées). Chaque unité UTF-16 de la copie
 * mémorise l'intervalle exact de l'original dont elle provient, ce qui permet de
 * ramener n'importe quel intervalle trouvé dans la copie au texte original.
 */

/** Intervalle UTF-16 dans un texte (début inclus, fin exclue). */
export interface Span {
  start: number;
  end: number;
}

export interface FoldOptions {
  /** Vrai par défaut. Faux : on supprime les accents mais on garde la casse. */
  lowerCase?: boolean;
}

export interface FoldedText {
  /** Texte normalisé. */
  readonly text: string;
  /** Longueur du texte original. */
  readonly originalLength: number;
  /**
   * Convertit un intervalle de la copie en intervalle du texte original.
   * Un intervalle vide donne un intervalle vide à la position correspondante.
   * Lève une `RangeError` si l'intervalle sort de la copie.
   */
  toOriginal(start: number, end: number): Span;
}

/** Marques combinantes diacritiques (U+0300 à U+036F) : seules supprimées, pour ne pas abîmer les autres écritures. */
const COMBINING_DIACRITICS = /[̀-ͯ]/g;

/** Remplacements que la décomposition NFD ne couvre pas (ligatures, ß). Les clés majuscules ne servent qu'en casse conservée. */
const EXPANSIONS: Readonly<Record<string, string>> = {
  œ: "oe",
  Œ: "OE",
  Æ: "AE",
  æ: "ae",
  ß: "ss",
  ﬀ: "ff",
  ﬁ: "fi",
  ﬂ: "fl",
  ﬃ: "ffi",
  ﬄ: "ffl",
  ﬅ: "st",
  ﬆ: "st",
};

function foldCodePoint(c: string, lowerCase: boolean): string {
  let s = c.normalize("NFD").replace(COMBINING_DIACRITICS, "");
  if (lowerCase) s = s.toLowerCase().replace(COMBINING_DIACRITICS, "");
  let out = "";
  for (const ch of s) out += EXPANSIONS[ch] ?? ch;
  return out;
}

/**
 * Produit la version normalisée de `text` et sa table de positions.
 * Une marque combinante supprimée étend la fin de l'unité qui la précède :
 * `e` + U+0301 est retrouvé comme un seul caractère de deux unités.
 */
export function foldText(text: string, options: FoldOptions = {}): FoldedText {
  const lowerCase = options.lowerCase ?? true;
  const starts: number[] = [];
  const ends: number[] = [];
  let out = "";
  let lastCpFirstUnit = -1;
  let i = 0;
  while (i < text.length) {
    const cp = text.codePointAt(i) as number;
    const width = cp > 0xffff ? 2 : 1;
    const e = i + width;
    let folded: string;
    if (cp < 0x80) {
      folded = lowerCase ? String.fromCharCode(cp).toLowerCase() : String.fromCharCode(cp);
    } else {
      folded = foldCodePoint(text.slice(i, e), lowerCase);
    }
    if (folded.length === 0) {
      for (let j = lastCpFirstUnit; j >= 0 && j < ends.length; j++) ends[j] = e;
    } else {
      lastCpFirstUnit = starts.length;
      for (let k = 0; k < folded.length; k++) {
        starts.push(i);
        ends.push(e);
      }
      out += folded;
    }
    i = e;
  }
  const originalLength = text.length;
  return {
    text: out,
    originalLength,
    toOriginal(start: number, end: number): Span {
      if (!(start >= 0 && start <= end && end <= out.length)) {
        throw new RangeError("Intervalle hors du texte normalisé.");
      }
      if (start === end) {
        const p = start < out.length ? (starts[start] as number) : originalLength;
        return { start: p, end: p };
      }
      return { start: starts[start] as number, end: ends[end - 1] as number };
    },
  };
}

/** Normalise une courte chaîne (terme, mot de contexte) sans table de positions. */
export function foldString(text: string, options: FoldOptions = {}): string {
  return foldText(text, options).text;
}

/** Mot : suite maximale de lettres, chiffres et marques Unicode. */
const WORD = /[\p{L}\p{N}\p{M}]+/gu;

export interface WordToken {
  text: string;
  start: number;
  end: number;
}

/** Découpe un texte en mots (positions dans le texte donné). */
export function tokenizeWords(text: string): WordToken[] {
  const tokens: WordToken[] = [];
  for (const m of text.matchAll(WORD)) {
    tokens.push({ text: m[0], start: m.index, end: m.index + m[0].length });
  }
  return tokens;
}
