import type { EntityType } from "./entities.ts";
import type { Language } from "./recognizer.ts";

/**
 * Liste fermée des validateurs algorithmiques (R8).
 * Un pack les référence par leur nom ; il ne fournit jamais de code.
 */
export const VALIDATOR_NAMES = [
  "luhn",
  "iban_mod97",
  "ean13",
  "fr_nir_key",
  "ch_uid_mod11",
  "fr_siren_luhn",
  "fr_siret_luhn",
] as const;

export type ValidatorName = (typeof VALIDATOR_NAMES)[number];

/**
 * Un validateur reçoit la valeur brute détectée (espaces, points et tirets
 * compris) et la normalise lui-même. Il renvoie `true` si la valeur est valide.
 */
export type Validator = (value: string) => boolean;

/** Mots de contexte qui rehaussent le score d'une détection proche. */
export interface ContextConfig {
  /** Mots ou expressions par langue, comparés sans tenir compte de la casse ni des accents. */
  words: Partial<Record<Language, string[]>> & { any?: string[] };
  /**
   * Si vrai, une détection sans mot de contexte à proximité est écartée.
   * Utilisé pour les règles à fort risque de faux positifs (codes postaux, SIREN).
   */
  required?: boolean;
}

/** Champs communs à toutes les règles d'un pack. */
interface BaseRule {
  /** Identifiant stable dans le pack (ex. `avs`). L'identifiant global est `<packId>/<id>`. */
  id: string;
  entityType: EntityType;
  /** Score de base entre 0 et 1, avant validation et contexte. */
  score: number;
  /** Langues concernées ; absent ou `any` = toutes. */
  languages?: Language[] | "any";
  context?: ContextConfig;
  /** Règle active par défaut. Vrai si absent. */
  enabled?: boolean;
  description?: string;
}

/** Règle par expression régulière. */
export interface PatternRule extends BaseRule {
  kind: "pattern";
  /** Source de l'expression régulière, sans délimiteurs. */
  pattern: string;
  /** Drapeaux autorisés : `i`, `m`, `s`, `u`. Le drapeau `g` est ajouté par le moteur. */
  flags?: string;
  /** Validateur appliqué à chaque correspondance. Échec = détection supprimée. */
  validator?: ValidatorName;
}

/** Règle par dictionnaire de termes. */
export interface DictionaryRule extends BaseRule {
  kind: "dictionary";
  /** Termes recherchés, comparés sans tenir compte de la casse ni des accents, sur des limites de mots Unicode. */
  terms: string[];
  /** Si vrai, la casse doit correspondre exactement (utile pour les prénoms ambigus). */
  caseSensitive?: boolean;
}

export type Rule = PatternRule | DictionaryRule;

/** Catégorie d'un pack. */
export type PackType = "global" | "country" | "language" | "domain";

/** Manifeste d'un pack, tel que décrit dans `manifest.json`. */
export interface PackManifest {
  /** Identifiant unique et stable (ex. `country-ch`). */
  id: string;
  /** Version sémantique du pack. */
  version: string;
  /** Version minimale du moteur requise (semver). */
  engineVersion: string;
  type: PackType;
  name: string;
  description?: string;
  /** Identifiants des packs requis. */
  dependencies?: string[];
  /** Fichiers de règles, relatifs au dossier du pack. */
  rules: string[];
}

/** Pack chargé en mémoire : manifeste et règles résolues. */
export interface Pack {
  manifest: PackManifest;
  rules: Rule[];
}
