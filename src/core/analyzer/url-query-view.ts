/**
 * Vue de reconnaissance des valeurs query (#30, #31). Un seul décodage UTF-8 ; le texte fourni
 * par l'utilisateur reste intact. Chaque unité UTF-16 de la vue garde son intervalle d'origine.
 * Une séquence malformée reste littérale, mais un triplet %XX reste indivisible au retour.
 */
import { AbortError } from "../recognizers/index.ts";

export interface TextRange {
  start: number;
  end: number;
}

export interface QueryView {
  text: string;
  originalRange(range: TextRange): TextRange;
  viewRange(range: TextRange): TextRange;
}

const QUERY = /[?&][\w.~-]+=(?<value>[^&#\s"'<>]*)/g;
const HEX = /^[\da-f]{2}$/i;

function byteAt(text: string, offset: number): number | null {
  if (text[offset] !== "%") return null;
  const hex = text.slice(offset + 1, offset + 3);
  return HEX.test(hex) ? Number.parseInt(hex, 16) : null;
}

export function urlQueryView(original: string, signal?: AbortSignal): QueryView | null {
  if (signal?.aborted) throw new AbortError();
  const values: TextRange[] = [];
  for (const match of original.matchAll(QUERY)) {
    const value = match.groups!.value!;
    if (/[+%]/.test(value)) {
      const end = match.index + match[0].length;
      values.push({ start: end - value.length, end });
    }
  }
  if (values.length === 0) return null;

  const parts: string[] = [];
  const starts: number[] = [];
  const ends: number[] = [];
  let cursor = 0;
  function append(text: string, start: number, end: number): void {
    parts.push(text);
    for (let j = 0; j < text.length; j++) {
      starts.push(start);
      ends.push(end);
    }
  }
  function copy(end: number): void {
    while (cursor < end) {
      if (cursor % 1024 === 0 && signal?.aborted) throw new AbortError();
      append(original[cursor]!, cursor, cursor + 1);
      cursor++;
    }
  }
  for (const value of values) {
    if (signal?.aborted) throw new AbortError();
    copy(value.start);
    while (cursor < value.end) {
      if (cursor % 1024 === 0 && signal?.aborted) throw new AbortError();
      // Les liens saisis à la main conservent souvent le + international initial d'un téléphone.
      if (original[cursor] === "+") {
        const prefix = cursor === value.start && /^\+\d/.test(original.slice(cursor, cursor + 2));
        append(prefix ? "+" : " ", cursor, cursor + 1);
        cursor++;
        continue;
      }
      const byte = byteAt(original, cursor);
      if (byte === null) {
        append(original[cursor]!, cursor, cursor + 1);
        cursor++;
        continue;
      }
      const count =
        byte < 0x80
          ? 1
          : byte >= 0xc2 && byte <= 0xdf
            ? 2
            : byte <= 0xef && byte >= 0xe0
              ? 3
              : byte >= 0xf0 && byte <= 0xf4
                ? 4
                : 0;
      let decoded: string | null = null;
      if (count > 0 && cursor + count * 3 <= value.end) {
        const encoded = original.slice(cursor, cursor + count * 3);
        try {
          decoded = decodeURIComponent(encoded);
        } catch {
          // UTF-8 invalide : aucune suppression ni remplacement par un caractère de substitution.
        }
      }
      const length = decoded === null ? 3 : count * 3;
      append(decoded ?? original.slice(cursor, cursor + length), cursor, cursor + length);
      cursor += length;
    }
  }
  copy(original.length);
  const text = parts.join("");
  return {
    text,
    originalRange({ start, end }) {
      return { start: starts[start] ?? original.length, end: ends[end - 1] ?? 0 };
    },
    viewRange({ start, end }) {
      // Recherche binaire : une sélection qui coupe un échappement couvre le caractère entier.
      let lo = 0,
        hi = ends.length;
      while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (ends[mid]! <= start) lo = mid + 1;
        else hi = mid;
      }
      const a = lo;
      lo = a;
      hi = starts.length;
      while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (starts[mid]! < end) lo = mid + 1;
        else hi = mid;
      }
      return { start: a, end: lo };
    },
  };
}
