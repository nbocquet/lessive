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
  /** Même longueur et mêmes positions, avec les + littéraux admis dans la partie locale d'un courriel. */
  emailText: string;
  originalRange(range: TextRange): TextRange;
  viewRange(range: TextRange): TextRange;
}

const QUERY = /[?&][^?&#=\s"'<>]+=(?<value>[^&#\s"'<>]*)/g;
const HEX = /^[\da-f]{2}$/i;

function byteAt(text: string, offset: number): number | null {
  if (text[offset] !== "%") return null;
  const hex = text.slice(offset + 1, offset + 3);
  return HEX.test(hex) ? Number.parseInt(hex, 16) : null;
}

export function urlQueryView(original: string, signal?: AbortSignal): QueryView | null {
  if (signal?.aborted) throw new AbortError();
  const values: TextRange[] = [];
  let scanned = 0;
  let inFragment = false;
  for (const match of original.matchAll(QUERY)) {
    // Le # borne le fragment jusqu'à la fin du jeton URL, même s'il contient ?x= ou &x=.
    while (scanned < match.index) {
      if (scanned % 1024 === 0 && signal?.aborted) throw new AbortError();
      const char = original[scanned++]!;
      if (/[\s"'<>]/.test(char)) inFragment = false;
      else if (char === "#") inFragment = true;
    }
    if (inFragment) continue;
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
  const literalPluses: number[] = [];
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
        if (!prefix) literalPluses.push(starts.length);
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
  const emailParts: string[] = [];
  let lastPlus = 0;
  for (const offset of literalPluses) {
    emailParts.push(text.slice(lastPlus, offset), "+");
    lastPlus = offset + 1;
  }
  emailParts.push(text.slice(lastPlus));
  return {
    text,
    emailText: literalPluses.length === 0 ? text : emailParts.join(""),
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
