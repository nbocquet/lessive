import { foldString, tokenizeWords } from "../recognizers/normalize.ts";
import type { Detection, Language, Rule } from "../types/index.ts";

/** Bonus de score apporté par un mot de contexte (PLAN.md §5). */
export const CONTEXT_BOOST = 0.35;
/** Taille de la fenêtre, en mots, de chaque côté de la détection. */
export const CONTEXT_WINDOW_WORDS = 5;

/*
 * Règle de comparaison des mots de contexte (appliquée mot par mot, y compris
 * dans une expression de plusieurs mots) :
 *
 * - par défaut : insensible à la casse et aux accents (« Siren » = « siren ») ;
 * - un mot de contexte qui contient une lettre accentuée (« né », « née ») ne
 *   correspond qu'avec ses accents : comparaison insensible à la casse
 *   seulement, après normalisation NFC. Sinon « né » deviendrait « ne », la
 *   négation française ;
 * - un mot de contexte qui se termine par un point (« M. », « Dr. », « art. »)
 *   ne correspond que si le mot du texte est suivi immédiatement d'un point
 *   dans le texte original. Sinon « M. » deviendrait la lettre isolée « m ».
 */

export interface ContextResult {
  /** Détections conservées, dans l'ordre d'entrée, éventuellement rehaussées. */
  detections: Detection[];
  /** Détections supprimées car `context.required` sans mot de contexte, pour affichage. */
  dropped: Detection[];
}

export type RulesById = ReadonlyMap<string, Rule> | Readonly<Record<string, Rule>>;

interface Token {
  text: string;
  start: number;
  end: number;
}

/** Mot du texte, prêt à être comparé selon les trois modes de comparaison. */
interface TextWord {
  /** Replié : sans casse ni accents. */
  folded: string;
  /** NFC en minuscules : accents conservés. */
  exact: string;
  /** Suivi immédiatement d'un point dans le texte original. */
  dot: boolean;
}

/** Mot d'une expression de contexte. */
interface PhraseWord {
  folded: string;
  /** Défini seulement si le mot contient une lettre accentuée. */
  exact: string | undefined;
  /** Le mot de contexte se termine par un point. */
  dot: boolean;
}

function matchesWord(w: TextWord, p: PhraseWord): boolean {
  if (p.dot && !w.dot) return false;
  return p.exact !== undefined ? w.exact === p.exact : w.folded === p.folded;
}

/** Mots d'une expression de contexte brute, avec leur mode de comparaison. */
function parsePhrase(raw: string): PhraseWord[] {
  return tokenizeWords(raw).map((t) => {
    const exact = t.text.normalize("NFC").toLowerCase();
    const folded = foldString(t.text);
    return {
      folded,
      exact: folded === exact ? undefined : exact,
      dot: raw[t.end] === ".",
    };
  });
}

function lookupRule(rules: RulesById, id: string): Rule | undefined {
  if (rules instanceof Map) return rules.get(id);
  const rec = rules as Readonly<Record<string, Rule>>;
  return Object.hasOwn(rec, id) ? rec[id] : undefined;
}

/** Mots de contexte applicables : langue d'analyse + `any` ; langue inconnue = toutes les langues. */
function wordsFor(words: Record<string, string[] | undefined>, language: Language | undefined) {
  const keys = language === undefined ? Object.keys(words) : [language, "any"];
  return keys.flatMap((k) => words[k] ?? []);
}

/** Cherche la suite de mots `phrase` dans `window` (mots consécutifs). */
function containsPhrase(window: readonly TextWord[], phrase: readonly PhraseWord[]): boolean {
  if (phrase.length === 0 || phrase.length > window.length) return false;
  for (let i = 0; i + phrase.length <= window.length; i++) {
    let ok = true;
    for (let k = 0; k < phrase.length; k++) {
      if (!matchesWord(window[i + k] as TextWord, phrase[k] as PhraseWord)) {
        ok = false;
        break;
      }
    }
    if (ok) return true;
  }
  return false;
}

/**
 * Rehausse le score des détections dont la règle déclare des mots de contexte
 * à moins de 5 mots avant ou après l'intervalle. Fonction pure et déterministe :
 * les détections d'entrée ne sont pas modifiées.
 *
 * - mot trouvé : score + 0,35 plafonné à 1,0 ; `contextBoost` = hausse effective ;
 *   une détection validée garde 1,0 ;
 * - `required` sans mot trouvé : détection supprimée et renvoyée dans `dropped`.
 *
 * `language` absent : les mots de toutes les langues sont utilisés.
 *
 * Comparaison des mots de contexte : sans casse ni accents par défaut ; avec
 * accents (casse ignorée, NFC) pour un mot qui en contient ; un mot terminé par
 * un point (« M. ») exige un point juste après le mot dans le texte original.
 */
export function applyContext(
  text: string,
  detections: readonly Detection[],
  rulesById: RulesById,
  language: Language | undefined,
): ContextResult {
  const kept: Detection[] = [];
  const dropped: Detection[] = [];
  let tokens: Token[] | undefined;
  let words: TextWord[] = [];
  const phraseCache = new Map<string, PhraseWord[]>();

  const phraseOf = (raw: string): PhraseWord[] => {
    let p = phraseCache.get(raw);
    if (!p) {
      p = parsePhrase(raw);
      phraseCache.set(raw, p);
    }
    return p;
  };

  // Premier index de token dont le début est >= pos (recherche dichotomique).
  const firstTokenStartingAtOrAfter = (toks: readonly Token[], pos: number): number => {
    let lo = 0;
    let hi = toks.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if ((toks[mid] as Token).start < pos) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };

  for (const d of detections) {
    const rule = lookupRule(rulesById, d.recognizerId);
    const context = rule?.context;
    if (!context) {
      kept.push(d);
      continue;
    }
    if (!tokens) {
      tokens = tokenizeWords(text);
      words = tokens.map((t) => ({
        folded: foldString(t.text),
        exact: t.text.normalize("NFC").toLowerCase(),
        dot: text[t.end] === ".",
      }));
    }
    // Mots entièrement avant l'intervalle : ceux dont la fin <= d.start ; après : début >= d.end.
    const afterIdx = firstTokenStartingAtOrAfter(tokens, d.end);
    let beforeEnd = firstTokenStartingAtOrAfter(tokens, d.start); // premiers tokens commençant à >= d.start
    // Un mot qui commence avant d.start mais déborde dans l'intervalle n'est pas « avant ».
    while (beforeEnd > 0 && (tokens[beforeEnd - 1] as Token).end > d.start) beforeEnd--;
    const before = words.slice(Math.max(0, beforeEnd - CONTEXT_WINDOW_WORDS), beforeEnd);
    const after = words.slice(afterIdx, afterIdx + CONTEXT_WINDOW_WORDS);

    const found = wordsFor(context.words, language).find((raw) => {
      const phrase = phraseOf(raw);
      return containsPhrase(before, phrase) || containsPhrase(after, phrase);
    });

    if (found === undefined) {
      if (context.required) {
        dropped.push({
          ...d,
          explanation: [...d.explanation, "aucun mot de contexte requis trouvé → écartée"],
        });
      } else {
        kept.push(d);
      }
      continue;
    }

    const score = Math.min(1, Math.round((d.score + CONTEXT_BOOST) * 1e6) / 1e6);
    kept.push({
      ...d,
      score,
      contextBoost: Math.round((score - d.score) * 1e6) / 1e6,
      explanation: [...d.explanation, `mot de contexte trouvé (« ${found} »)`],
    });
  }
  return { detections: kept, dropped };
}
