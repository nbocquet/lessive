/**
 * Orchestrateur d'analyse (T1.8).
 *
 * Chaîne : détecteurs actifs (+ NER optionnel) → contexte → seuil et conflits.
 * Le NER est injecté : le moteur ne connaît aucune implémentation (R3).
 */
import { applyContext } from "../context/index.ts";
import { resolveConflicts } from "../conflicts/index.ts";
import type { ActiveRule } from "../registry/index.ts";
import { AbortError, DictionaryRecognizer, PatternRecognizer } from "../recognizers/index.ts";
import {
  MAX_INPUT_LENGTH,
  type AnalysisContext,
  type AnalysisResult,
  type Detection,
  type Language,
  type NerEngine,
  type Recognizer,
  type Rule,
} from "../types/index.ts";
import { getValidator } from "../validators/index.ts";
import { mergeAdjacentPersons } from "./merge-persons.ts";
import { collectAmbiguousNames, propagatePersonNames } from "./propagate-names.ts";

/** Seuil par défaut de l'analyse (aligné sur la résolution des conflits). */
const DEFAULT_MIN_SCORE = 0.5;

export interface AnalyzeOptions {
  /** Langue principale du texte. Absente : tous les détecteurs s'appliquent. */
  language?: Language;
  /** Moteur NER optionnel, déjà chargé. */
  ner?: NerEngine;
  /** Seuil de score (défaut 0,5). */
  minScore?: number;
  signal?: AbortSignal;
  /**
   * Détections ajoutées à la main par l'utilisateur ; elles gagnent tous les conflits.
   * Elles sont validées : une borne invalide (non entière, `start < 0`, `start >= end`,
   * `end > text.length`, ou coupant une paire de substitution UTF-16) fait lever une
   * `RangeError` (sans valeur du texte dans le message). Leurs identifiants sont
   * réattribués (`m1`, `m2`… dans l'ordre d'entrée) pour éviter toute collision avec les
   * identifiants générés (`d1`…) ; l'identifiant d'origine n'est pas conservé.
   */
  manual?: Detection[];
  /**
   * Formes de surface de personnes connues d'avance (par exemple celles des entités PERSON de la
   * session), pour propager les noms d'un document à l'autre : elles sont traitées comme des noms
   * « sûrs » de ce texte. Elles restent en mémoire et ne sont jamais recopiées dans le résultat (R5).
   */
  knownPersons?: readonly string[];
  /**
   * Prénoms ambigus supplémentaires (comparés sans casse ni accents), jamais propagés seuls. Ils
   * s'ajoutent à ceux des règles actives `prenoms-ambigus` : à remplir par l'appelant si cette règle
   * peut être désactivée alors que la protection doit rester.
   */
  ambiguousGivenNames?: ReadonlySet<string>;
}

export interface Analyzer {
  readonly recognizers: readonly Recognizer[];
  analyze(text: string, options?: AnalyzeOptions): Promise<AnalysisResult>;
}

/** Construit un détecteur à partir d'une règle de pack. */
export function buildRecognizer(active: ActiveRule): Recognizer {
  const { rule, packId } = active;
  if (rule.kind === "pattern") {
    const validator = rule.validator ? getValidator(rule.validator) : undefined;
    return new PatternRecognizer(rule, packId, validator);
  }
  return new DictionaryRecognizer(rule, packId);
}

function appliesTo(r: Recognizer, language: Language | undefined): boolean {
  return language === undefined || r.languages === "any" || r.languages.includes(language);
}

const isHigh = (c: number) => c >= 0xd800 && c <= 0xdbff;
const isLow = (c: number) => c >= 0xdc00 && c <= 0xdfff;

/** Vrai si `pos` tombe entre les deux unités d'une paire de substitution. */
function splitsSurrogate(text: string, pos: number): boolean {
  return (
    pos > 0 && pos < text.length && isHigh(text.charCodeAt(pos - 1)) && isLow(text.charCodeAt(pos))
  );
}

/** Rejette (RangeError) une détection manuelle aux bornes invalides. Le message ne contient aucune valeur du texte. */
function assertValidManual(text: string, d: Detection, index: number): void {
  const { start, end } = d;
  const ok =
    Number.isInteger(start) &&
    Number.isInteger(end) &&
    start >= 0 &&
    start < end &&
    end <= text.length &&
    !splitsSurrogate(text, start) &&
    !splitsSurrogate(text, end);
  if (!ok) {
    throw new RangeError(
      `Détection manuelle n° ${index + 1} invalide : bornes hors du texte, vides, inversées ou coupant un caractère.`,
    );
  }
}

/** Crée un analyseur à partir des règles actives d'un registre. */
export function createAnalyzer(activeRules: readonly ActiveRule[]): Analyzer {
  const recognizers = activeRules.map(buildRecognizer);
  const rulesById = new Map<string, Rule>(activeRules.map((a) => [a.globalId, a.rule]));
  const ambiguous = collectAmbiguousNames(activeRules);

  return {
    recognizers,
    async analyze(text, options = {}) {
      if (text.length > MAX_INPUT_LENGTH) {
        throw new RangeError(
          `Texte trop long : ${text.length} caractères, maximum ${MAX_INPUT_LENGTH}.`,
        );
      }
      const { language, ner, signal, manual = [] } = options;
      manual.forEach((d, i) => assertValidManual(text, d, i));
      let counter = 0;
      const ctx: AnalysisContext = {
        nextId: () => `d${++counter}`,
        ...(language ? { language } : {}),
        ...(signal ? { signal } : {}),
      };
      const warnings: string[] = [];
      const raw: Detection[] = [];

      for (const r of recognizers) {
        if (signal?.aborted) throw new AbortError();
        if (!appliesTo(r, language)) continue;
        raw.push(...(await r.analyze(text, ctx)));
      }

      if (ner) {
        try {
          raw.push(...(await ner.recognize(text, ctx)));
        } catch (err) {
          if (signal?.aborted || (err instanceof Error && err.name === "AbortError")) throw err;
          warnings.push(
            "La reconnaissance des noms (NER) a échoué : seuls les détecteurs par règles ont été appliqués.",
          );
        }
      } else {
        warnings.push(
          "La reconnaissance des noms (NER) n'est pas active : les noms de personnes, lieux et organisations peuvent manquer.",
        );
      }

      const { detections: contextual, dropped } = applyContext(text, raw, rulesById, language);
      const persons = mergeAdjacentPersons(text, contextual, ctx);
      const manualWithIds = manual.map((d, i) => ({
        ...d,
        id: `m${i + 1}`,
        source: "manual" as const,
      }));
      const minScore = options.minScore ?? DEFAULT_MIN_SCORE;
      // Propagation : prénoms seuls et identifiants dérivés de noms déjà sûrs, avant les conflits.
      const known = [...contextual, ...persons, ...manualWithIds];
      const propagated = propagatePersonNames(text, known, ctx, {
        minScore,
        ...(options.knownPersons ? { knownPersons: options.knownPersons } : {}),
        ambiguousGivenNames: new Set([...ambiguous.given, ...(options.ambiguousGivenNames ?? [])]),
        ambiguousFamilyNames: ambiguous.family,
      });
      const { kept, discarded } = resolveConflicts([...known, ...propagated], { minScore });

      return { detections: kept, discarded: [...dropped, ...discarded], warnings };
    },
  };
}
