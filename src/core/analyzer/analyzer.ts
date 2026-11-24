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
import { mergeAddressParts } from "./merge-addresses.ts";
import { mergeAdjacentPersons } from "./merge-persons.ts";
import { collectAmbiguousNames, createPersonNamePropagator } from "./propagate-names.ts";
import { urlQueryView } from "./url-query-view.ts";

/** Seuil par défaut de l'analyse (aligné sur la résolution des conflits). */
const DEFAULT_MIN_SCORE = 0.5;

export const NER_INACTIVE_WARNING =
  "Analyse sans modèle de reconnaissance des noms : seules les règles intégrées ont été utilisées. Des noms de personnes, de lieux ou d’organisations peuvent rester en clair. Vérifiez-les avant de copier le résultat.";

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

/** Test d'inclusion en O(log n), sans comparer chaque détection à chaque URL du document. */
function coveredBy(urls: readonly Detection[], overlap = false): (d: Detection) => boolean {
  const sorted = [...urls].sort((a, b) => a.start - b.start);
  const maxEnds: number[] = [];
  sorted.forEach((d, i) => maxEnds.push(Math.max(d.end, maxEnds[i - 1] ?? 0)));
  return (d) => {
    let lo = 0;
    let hi = sorted.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (overlap ? sorted[mid]!.start < d.end : sorted[mid]!.start <= d.start) lo = mid + 1;
      else hi = mid;
    }
    return lo > 0 && (overlap ? maxEnds[lo - 1]! > d.start : maxEnds[lo - 1]! >= d.end);
  };
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
  const propagate = createPersonNamePropagator(collectAmbiguousNames(activeRules));

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
      const original = text;
      const view = urlQueryView(original, signal);
      text = view?.text ?? original;
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
        // Un + de query sépare les mots et groupes téléphoniques, mais reste légal dans la
        // partie locale d'un courriel. La variante EMAIL garde exactement les mêmes positions.
        const input = view && r.supportedEntities.includes("EMAIL") ? view.emailText : text;
        raw.push(...(await r.analyze(input, ctx)));
      }

      if (ner) {
        try {
          raw.push(...(await ner.recognize(text, ctx)));
        } catch (err) {
          if (signal?.aborted || (err instanceof Error && err.name === "AbortError")) throw err;
          warnings.push(
            "La reconnaissance des noms a échoué pendant l’analyse. Seules les règles intégrées ont été utilisées : des noms de personnes, de lieux ou d’organisations peuvent rester en clair. Relancez l’analyse ou vérifiez-les à la main.",
          );
        }
      } else {
        warnings.push(NER_INACTIVE_WARNING);
      }

      const { detections: contextual, dropped } = applyContext(text, raw, rulesById, language);
      const persons = mergeAdjacentPersons(text, contextual, ctx);
      // Rue + code postal et localité (+ case postale) adjacents : une seule adresse.
      const addresses = mergeAddressParts(text, contextual, ctx);
      const manualWithIds = manual.map((d, i) => ({
        ...d,
        ...(view ? view.viewRange(d) : {}),
        id: `m${i + 1}`,
        source: "manual" as const,
      }));
      const minScore = options.minScore ?? DEFAULT_MIN_SCORE;
      // Propagation : prénoms seuls et identifiants dérivés de noms déjà sûrs, avant les conflits.
      const known = [...contextual, ...persons, ...addresses, ...manualWithIds];
      const propagated = propagate(text, known, ctx, {
        minScore,
        ...(options.knownPersons ? { knownPersons: options.knownPersons } : {}),
        ...(options.ambiguousGivenNames
          ? { ambiguousGivenNames: options.ambiguousGivenNames }
          : {}),
      });
      const toOriginal = (d: Detection): Detection =>
        view ? { ...d, ...view.originalRange(d) } : d;
      let candidates = [...known, ...propagated].map(toOriginal);
      if (view) {
        // Le décodage d'un espace ne doit pas découper une URL absolue que sa règle protège
        // déjà en entier. Les ajouts manuels restent prioritaires, comme dans le texte ordinaire.
        const urls: Detection[] = [];
        for (const r of recognizers) {
          if (signal?.aborted) throw new AbortError();
          if (appliesTo(r, language) && r.supportedEntities.includes("URL")) {
            urls.push(...(await r.analyze(original, ctx)));
          }
        }
        const overlapsManual = coveredBy(manual, true);
        const covered = coveredBy(
          urls.filter(
            (u) =>
              u.score >= minScore &&
              !overlapsManual(u) &&
              /\?[^#]*[+%]/.test(original.slice(u.start, u.end)),
          ),
        );
        candidates = candidates.filter((d) => d.source === "manual" || !covered(d));
        candidates.push(...urls);
      }
      const { kept, discarded } = resolveConflicts(candidates, { minScore, text: original });
      if (view) {
        // La résolution peut rogner une détection autour d'une adresse protégée. Cette dernière
        // coupe doit elle aussi respecter les échappements ; une seconde résolution sans rognure
        // arbitre les éventuels chevauchements créés par l'élargissement d'un triplet entier.
        const snap = (d: Detection): Detection => ({
          ...d,
          ...view.originalRange(view.viewRange(d)),
        });
        const safe = resolveConflicts(kept.map(snap), { minScore });
        return {
          detections: safe.kept,
          discarded: [...dropped.map(toOriginal), ...discarded.map(snap), ...safe.discarded],
          warnings,
        };
      }
      return { detections: kept, discarded: [...dropped, ...discarded], warnings };
    },
  };
}
