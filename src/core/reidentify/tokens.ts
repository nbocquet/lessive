import type { EntityType, Session } from "../types/index.ts";
import { InMemorySession } from "../mapping/session.ts";
import { formatPseudonym } from "../mapping/pseudonym.ts";
import { typeOfWord, WORD_ALTERNATION } from "./words.ts";

/**
 * Analyseur tolérant de jetons (format A, `PERSONNE_001`), porté de
 * `spikes/tokens/analyzer.mjs`. Fonction pure : aucune valeur d'origine n'est
 * lue ni renvoyée, seulement des positions et des pseudonymes canoniques.
 *
 * Variantes reconnues : casse, espace / tiret / `\_` à la place du tiret bas,
 * zéros de tête absents ou en trop, crochets ajoutés (avalés dans la zone),
 * type traduit en anglais, possessif ou pluriel anglais accolé (laissé en
 * place), jeton coupé par un seul retour à la ligne.
 *
 * Garde-fous : jamais à l'intérieur d'un mot ; `PERSONNE_1` ≠ `PERSONNE_10` ;
 * une forme sans tiret bas exige le type en majuscules (« la personne 2 » n'est
 * pas un jeton).
 */

export type TokenStatus = "known" | "unknown" | "ambiguous";

export interface TokenMatch {
  /** Début de la zone à remplacer (UTF-16, inclus), crochets ajoutés compris. */
  start: number;
  /** Fin de la zone à remplacer (UTF-16, exclue). */
  end: number;
  /** Pseudonyme sous sa forme canonique (`PERSONNE_001`). */
  canonical: string;
  /** Entité désignée, si le jeton est connu. */
  entityId?: string;
  status: TokenStatus;
}

const WS = "[ \\t\\u00a0\\u202f]";
const SPACE = `(?:${WS}+|${WS}*\\r?\\n${WS}*)`; // espaces, ou un seul retour à la ligne
const DASH = "\\\\?[_\\-\\u2010-\\u2015\\u2212]"; // _ - ‐ – — − , éventuellement échappé
const SEP = `(?:(?:${SPACE})?${DASH}(?:${SPACE})?|${SPACE})`;
const TOKEN_RE = new RegExp(`(${WORD_ALTERNATION})(${SEP})(\\d+)`, "giu");

const isWordChar = (ch: string | undefined): boolean =>
  ch !== undefined && /[\p{L}\p{N}]/u.test(ch);

/** Frontière gauche : pas de lettre/chiffre avant (les `_` markdown sont franchis). */
function leftOk(text: string, i: number): boolean {
  let j = i - 1;
  while (j >= 0 && text[j] === "_") j--;
  return !(j >= 0 && isWordChar(text[j]));
}

/** Frontière droite : pas de lettre/chiffre après (les `_` markdown sont franchis). */
function rightOk(text: string, i: number): boolean {
  const n = text[i];
  if (n === undefined) return true;
  if (isWordChar(n)) return false;
  if (n === "_") {
    let j = i;
    while (text[j] === "_") j++;
    return !isWordChar(text[j]);
  }
  return true;
}

const SUFFIX_RE = /^(?:['’]s|s)(?![\p{L}\p{N}])/iu;

/** Possessif ou pluriel anglais accolé : `'s`, `s`. */
function hasSuffix(text: string, i: number): boolean {
  return SUFFIX_RE.test(text.slice(i, i + 4));
}

// Crochets « autour » : avalés seulement s'ils sont en nombre égal et de la
// même famille de chaque côté. Les guillemets et astérisques ne sont jamais avalés.
const OPEN_RE = /((?:\\?\[)+|\\?\{|⟦|〚)[ \t]*$/u;
const CLOSE_RE = /^[ \t]*((?:\\?\])+|\\?\}|⟧|〛)/u;
const OPENER_FAMILY: Record<string, string> = { "[": "[", "{": "{", "⟦": "⟦", "〚": "〚" };
const CLOSER_FAMILY: Record<string, string> = { "]": "[", "}": "{", "⟧": "⟦", "〛": "〚" };

function bracketInfo(raw: string, families: Record<string, string>) {
  const bare = raw.replace(/\\/g, "");
  return { family: families[bare[0] ?? ""], count: bare.length };
}

function wrapAround(
  text: string,
  start: number,
  end: number,
): { start: number; end: number } | undefined {
  const before = OPEN_RE.exec(text.slice(Math.max(0, start - 16), start));
  const after = CLOSE_RE.exec(text.slice(end, end + 16));
  if (!before || !after) return undefined;
  const o = bracketInfo(before[1] ?? "", OPENER_FAMILY);
  const c = bracketInfo(after[1] ?? "", CLOSER_FAMILY);
  if (o.family === undefined || o.family !== c.family || o.count !== c.count) return undefined;
  return { start: start - before[0].length, end: end + after[0].length };
}

function isAmbiguous(session: Session, pseudonym: string): boolean {
  return session instanceof InMemorySession && session.isAmbiguousPseudonym(pseudonym);
}

/**
 * Trouve les jetons du format A et leurs variantes dans `text`.
 * Les correspondances sont triées par position et ne se chevauchent pas.
 */
export function findTokens(text: string, session: Session): TokenMatch[] {
  const matches: TokenMatch[] = [];
  const cache = new Map<string, { status: TokenStatus; entityId?: string }>();

  const lookup = (canonical: string) => {
    let hit = cache.get(canonical);
    if (!hit) {
      const entity = session.byPseudonym(canonical);
      if (entity) hit = { status: "known", entityId: entity.id };
      else if (isAmbiguous(session, canonical)) hit = { status: "ambiguous" };
      else hit = { status: "unknown" };
      cache.set(canonical, hit);
    }
    return hit;
  };

  let cursor = 0;
  for (const m of text.matchAll(TOKEN_RE)) {
    const [core, word = "", sep = "", digits = ""] = m;
    const coreStart = m.index;
    const coreEnd = coreStart + core.length;
    const entityType: EntityType | undefined = typeOfWord(word);
    if (!entityType) continue;
    const canonical = formatPseudonym(entityType, Number(digits));
    const { status, entityId } = lookup(canonical);

    const allCaps = word === word.toUpperCase();
    const hasUnderscore = sep.includes("_");
    const hasSpace = /\s/.test(sep);
    const isDash = !hasUnderscore && /[-\u2010-\u2015\u2212]/.test(sep);
    // Règle anti faux positifs : « la personne 2 », « lieu - 2024 », « Person 1 »…
    const knownOk = hasUnderscore || (isDash ? allCaps || !hasSpace : allCaps);
    const unknownOk = hasUnderscore || (allCaps && digits.length > 1 && digits.startsWith("0"));
    if (status === "unknown" ? !unknownOk : !knownOk) continue;

    const wrap = wrapAround(text, coreStart, coreEnd);
    let start = coreStart;
    let end = coreEnd;
    if (wrap) {
      start = wrap.start;
      end = wrap.end;
    } else if (!leftOk(text, coreStart)) {
      continue;
    } else if (!hasSuffix(text, end) && !rightOk(text, end)) {
      continue;
    }
    if (start < cursor) continue; // chevauchement avec le jeton précédent
    cursor = end;
    matches.push(
      entityId === undefined
        ? { start, end, canonical, status }
        : { start, end, canonical, entityId, status },
    );
  }
  return matches;
}
