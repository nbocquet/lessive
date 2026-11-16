import type { EntityType } from "./entities.ts";

/** Origine d'une détection. */
export type DetectionSource = "pattern" | "dictionary" | "ner" | "manual";

/**
 * Une détection : un intervalle du texte original reconnu comme une entité.
 *
 * Positions (R7) : indices en unités de code UTF-16, c'est-à-dire les indices
 * de chaîne JavaScript, sur le texte original non modifié.
 * `start` inclus, `end` exclu : `text.slice(start, end)` donne la valeur.
 *
 * Une détection ne contient jamais la valeur originale : on la relit dans le
 * texte au besoin. Cela évite qu'elle fuie dans un rapport ou un log (R5).
 */
export interface Detection {
  /** Identifiant unique dans une analyse. */
  id: string;
  start: number;
  end: number;
  entityType: EntityType;
  /**
   * Score entre 0 et 1. Heuristique, ce n'est pas une probabilité :
   * 0,9 ne veut pas dire « 90 % de chances ».
   */
  score: number;
  /** Identifiant stable du détecteur (ex. `country-ch/avs`). */
  recognizerId: string;
  /** Identifiant du pack qui fournit le détecteur (`manual` pour un ajout utilisateur). */
  packId: string;
  source: DetectionSource;
  /** Vrai si un validateur algorithmique a réussi sur cette valeur. */
  validated?: boolean;
  /** Bonus de score apporté par le contexte, déjà inclus dans `score`. */
  contextBoost?: number;
  /**
   * Étapes de la décision, lisibles par l'utilisateur, par exemple
   * « motif AVS (score 0,5) », « clé EAN-13 valide → 1,0 ».
   * Ne doit jamais contenir la valeur détectée.
   */
  explanation: string[];
  /** Identifiant de la détection qui l'a emporté lors de la résolution des conflits. */
  supersededBy?: string;
}

/** Résultat d'une analyse complète. */
export interface AnalysisResult {
  /** Détections retenues, triées par `start` croissant, sans chevauchement. */
  detections: Detection[];
  /** Détections écartées (sous le seuil ou perdantes d'un conflit), pour affichage. */
  discarded: Detection[];
  /** Avertissements non bloquants (ex. « NER non chargé »), sans valeur originale. */
  warnings: string[];
}

/** Longueur maximale d'un texte analysé, en unités UTF-16 (protection ReDoS et mémoire). */
export const MAX_INPUT_LENGTH = 200_000;
