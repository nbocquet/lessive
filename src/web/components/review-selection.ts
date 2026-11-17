/**
 * Sélection de texte et recherche d'occurrences (T5.3) : logique pure, sans DOM.
 *
 * Toutes les positions sont des indices UTF-16 du texte original (R7). Le composant
 * HighlightedText convertit les bornes du DOM en positions avec `boundaryPosition` et
 * `rootBoundaryPosition`, puis `resolveSelection` les normalise.
 */
import type { EntityType } from "../../core/index.ts";

export interface TextRange {
  start: number;
  end: number;
}

export interface PlannedSpan extends TextRange {
  entityType: EntityType;
}

/** Plafond d'occurrences ajoutées d'un coup (une seule relance d'analyse). */
export const MAX_OCCURRENCES = 1000;

const isHigh = (c: number): boolean => c >= 0xd800 && c <= 0xdbff;
const isLow = (c: number): boolean => c >= 0xdc00 && c <= 0xdfff;

/**
 * Position d'une borne du DOM dans un segment dont le texte commence à `segStart`
 * et fait `segLength` unités. `offset` est celui de la borne ; pour une borne sur un
 * nœud de texte c'est un décalage en unités UTF-16, pour une borne sur un élément
 * c'est un rang d'enfant (0 : avant le contenu, sinon après).
 */
export function boundaryPosition(
  segStart: number,
  segLength: number,
  offset: number,
  isTextNode: boolean,
): number {
  if (isTextNode) return segStart + Math.min(Math.max(offset, 0), segLength);
  return offset <= 0 ? segStart : segStart + segLength;
}

/**
 * Position d'une borne posée sur le conteneur lui-même : `childIndex` est le rang
 * d'enfant parmi les segments, dont `segmentStarts` donne les débuts.
 */
export function rootBoundaryPosition(
  segmentStarts: readonly number[],
  textLength: number,
  childIndex: number,
): number {
  const start = segmentStarts[childIndex];
  return childIndex < segmentStarts.length && start !== undefined ? start : textLength;
}

/** Recule/avance les bornes pour ne jamais couper une paire de substitution. */
export function snapToCodePoints(text: string, start: number, end: number): TextRange {
  let s = start;
  let e = end;
  if (s > 0 && s < text.length && isLow(text.charCodeAt(s)) && isHigh(text.charCodeAt(s - 1))) s--;
  if (e > 0 && e < text.length && isLow(text.charCodeAt(e)) && isHigh(text.charCodeAt(e - 1))) e++;
  return { start: s, end: e };
}

/**
 * Normalise une sélection brute : ordre des bornes, bornage au texte, espaces de
 * tête et de queue retirés, paires de substitution entières. `null` si rien ne reste.
 */
export function resolveSelection(text: string, a: number, b: number): TextRange | null {
  let start = Math.max(0, Math.min(a, b, text.length));
  let end = Math.min(text.length, Math.max(a, b));
  while (start < end && /\s/u.test(text.charAt(start))) start++;
  while (end > start && /\s/u.test(text.charAt(end - 1))) end--;
  if (start >= end) return null;
  return snapToCodePoints(text, start, end);
}

const WORD_CHAR = /^[\p{L}\p{M}\p{N}_]$/u;

function charBefore(text: string, index: number): string {
  if (index <= 0) return "";
  const c = text.charCodeAt(index - 1);
  if (isLow(c) && index >= 2 && isHigh(text.charCodeAt(index - 2)))
    return text.slice(index - 2, index);
  return text.charAt(index - 1);
}

function charAt(text: string, index: number): string {
  if (index >= text.length) return "";
  const cp = text.codePointAt(index);
  return cp === undefined ? "" : String.fromCodePoint(cp);
}

function escapeRegExp(s: string): string {
  return s.replace(/[\\^$.*+?()[\]{}|/]/g, "\\$&");
}

export interface Occurrences {
  ranges: TextRange[];
  /** Vrai si la liste a été coupée à `MAX_OCCURRENCES`. */
  truncated: boolean;
}

/**
 * Cherche toutes les occurrences de `needle` dans `text` : insensible à la casse,
 * non chevauchantes, aux limites de mots (une limite n'est exigée que du côté où
 * `needle` commence ou finit par un caractère de mot). Toute suite d'espaces de
 * `needle` correspond à n'importe quelle suite d'espaces ou de retours à la ligne.
 * Les positions renvoyées sont celles du texte original.
 */
export function findOccurrences(text: string, needle: string): Occurrences {
  const parts = needle.trim().split(/\s+/u).filter(Boolean);
  if (parts.length === 0) return { ranges: [], truncated: false };
  const re = new RegExp(parts.map(escapeRegExp).join("\\s+"), "giu");
  const first = charAt(parts[0] ?? "", 0);
  const lastPart = parts[parts.length - 1] ?? "";
  const last = charBefore(lastPart, lastPart.length);
  const needLeft = WORD_CHAR.test(first);
  const needRight = WORD_CHAR.test(last);
  const ranges: TextRange[] = [];
  let truncated = false;
  for (const m of text.matchAll(re)) {
    const start = m.index;
    const end = start + m[0].length;
    if (needLeft && WORD_CHAR.test(charBefore(text, start))) continue;
    if (needRight && WORD_CHAR.test(charAt(text, end))) continue;
    if (ranges.length >= MAX_OCCURRENCES) {
      truncated = true;
      break;
    }
    ranges.push({ start, end });
  }
  return { ranges, truncated };
}

export interface ManualPlan {
  spans: PlannedSpan[];
  /** Nombre d'occurrences trouvées (avant plafonnement ou limitation à une seule). */
  found: number;
  truncated: boolean;
}

/**
 * Détections manuelles à créer.
 * - Avec `selection` : la valeur est le texte sélectionné ; la sélection elle-même est
 *   toujours ajoutée, même si elle ne tombe pas sur des limites de mots.
 * - Sans sélection, avec `query` (saisie au clavier) : les occurrences de `query`.
 * - `all` faux : une seule détection (la sélection, ou la première occurrence de `query`).
 * Les intervalles sont triés, sans doublon.
 */
export function planManualSpans(
  text: string,
  selection: TextRange | null,
  query: string,
  entityType: EntityType,
  all: boolean,
): ManualPlan {
  const needle = selection ? text.slice(selection.start, selection.end) : query;
  const { ranges, truncated } = findOccurrences(text, needle);
  let chosen: TextRange[];
  if (!all) {
    const one = selection ?? ranges[0];
    chosen = one ? [one] : [];
  } else {
    chosen = [...ranges];
    if (selection && !chosen.some((r) => r.start === selection.start && r.end === selection.end)) {
      chosen.push(selection);
    }
  }
  chosen.sort((x, y) => x.start - y.start || x.end - y.end);
  const spans = chosen.map((r) => ({ start: r.start, end: r.end, entityType }));
  return { spans, found: Math.max(ranges.length, selection ? 1 : 0), truncated };
}
