import type { Detection } from "./detection.ts";
import type { EntityType } from "./entities.ts";

/** Mode de traitement (amendement A3 : jamais « anonymisation »). */
export type Mode = "masking" | "pseudonymization";

/** Opérateurs de transformation du MVP. */
export type OperatorId = "suppress" | "mask" | "categorize" | "pseudonymize";

/**
 * Entité réelle (une personne, un lieu…), indépendante de ses occurrences.
 * Plusieurs formes (« Claire Martin », « Mme Martin ») peuvent désigner la même entité.
 */
export interface Entity {
  id: string;
  entityType: EntityType;
  /** Pseudonyme attribué, unique par type dans la session (ex. `PERSONNE_001`). */
  pseudonym: string;
  /**
   * Formes rencontrées dans les textes de la session.
   * Données sensibles : jamais exportées en clair, jamais loguées (R5).
   */
  surfaceForms: string[];
  /** Vrai si le rattachement automatique est incertain et doit être vérifié. */
  needsReview: boolean;
}

/**
 * Session de pseudonymisation : table de correspondance partagée entre plusieurs textes.
 * Vit en mémoire uniquement (R5).
 */
export interface Session {
  readonly id: string;
  /** Renvoie l'entité correspondant à une forme, en la créant au besoin. */
  resolve(surfaceForm: string, entityType: EntityType): Entity;
  /** Toutes les entités de la session. */
  entities(): readonly Entity[];
  /** Fusionne `sourceId` dans `targetId` ; les formes de la source rejoignent la cible. */
  merge(targetId: string, sourceId: string): void;
  /** Détache une forme de son entité et crée une nouvelle entité pour elle. */
  split(entityId: string, surfaceForm: string): Entity;
  /** Retrouve une entité par son pseudonyme exact. */
  byPseudonym(pseudonym: string): Entity | undefined;
}

/** Contexte passé à un opérateur. */
export interface OperatorContext {
  /** Valeur originale relue dans le texte. */
  value: string;
  detection: Detection;
  /** Présente uniquement pour l'opérateur `pseudonymize`. */
  session?: Session;
}

/** Un opérateur transforme une valeur détectée en texte de remplacement. */
export interface Operator {
  readonly id: OperatorId;
  apply(ctx: OperatorContext): string;
}

/** Choix d'opérateur par type d'entité, avec repli par défaut. */
export interface TransformPlan {
  mode: Mode;
  defaultOperator: OperatorId;
  byEntityType?: Partial<Record<EntityType, OperatorId>>;
  /** Choix manuels de l'utilisateur, par identifiant de détection. Priment sur le reste. */
  byDetectionId?: Record<string, OperatorId>;
}

/** Trace d'une transformation. Ne contient jamais la valeur originale (R5). */
export interface AppliedTransformation {
  detectionId: string;
  entityType: EntityType;
  operator: OperatorId;
  /** Position dans le texte original. */
  originalStart: number;
  originalEnd: number;
  /** Position du remplacement dans le texte transformé. */
  outputStart: number;
  outputEnd: number;
  /** Texte inséré (pseudonyme, masque, catégorie ou chaîne vide). */
  replacement: string;
}

/** Résultat d'une transformation. */
export interface TransformResult {
  text: string;
  applied: AppliedTransformation[];
  /** Erreurs non bloquantes, sans valeur originale. */
  errors: string[];
}
