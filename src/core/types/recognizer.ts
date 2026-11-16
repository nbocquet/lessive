import type { Detection } from "./detection.ts";
import type { EntityType } from "./entities.ts";

/** Langue d'analyse. Le MVP couvre le français et l'anglais. */
export type Language = "fr" | "en";

/** Contexte transmis à chaque détecteur. */
export interface AnalysisContext {
  /** Langue principale du texte, si connue. */
  language?: Language;
  /** Permet d'annuler une analyse longue. Les détecteurs le vérifient régulièrement. */
  signal?: AbortSignal;
  /** Génère un identifiant unique de détection. */
  nextId: () => string;
}

/** Contrat commun à tous les détecteurs. */
export interface Recognizer {
  /** Identifiant stable, unique, de la forme `<packId>/<ruleId>`. */
  readonly id: string;
  readonly packId: string;
  readonly supportedEntities: readonly EntityType[];
  /** Langues où le détecteur s'applique ; `any` pour un détecteur indépendant de la langue. */
  readonly languages: readonly Language[] | "any";
  analyze(text: string, ctx: AnalysisContext): Promise<Detection[]>;
}

/**
 * Moteur NER : interface implémentée par `src/ner` et injectée dans l'analyseur.
 * Le moteur `src/core` ne connaît aucune implémentation concrète.
 */
export interface NerEngine {
  /** Charge le modèle depuis les ressources locales (R4). `onProgress` reçoit une valeur entre 0 et 1. */
  load(onProgress?: (progress: number) => void): Promise<void>;
  /** Détections de type PERSON, ORGANIZATION ou LOCATION, avec `source: "ner"`. */
  recognize(text: string, ctx: AnalysisContext): Promise<Detection[]>;
  dispose(): Promise<void>;
}
