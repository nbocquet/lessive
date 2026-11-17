/**
 * Protocole de messages entre la page et le worker d'analyse (T5.1).
 *
 * Règles :
 * - aucune réponse ne reprend le texte analysé ni une valeur détectée (R5) ;
 *   les erreurs portent un code et un message sans valeur ;
 * - `id` relie chaque réponse à sa requête ; les réponses d'un `id` annulé
 *   peuvent encore arriver, le client les ignore.
 */
import type { AnalysisResult, Detection, Language } from "../core/index.ts";

/** Demande d'analyse. */
export interface AnalyzeRequest {
  type: "analyze";
  id: number;
  /** Texte original, non modifié (R7). */
  text: string;
  /** Langue du texte ; absente = « auto » : aucun filtre par langue. */
  language?: Language;
  /** Seuil de score, entre 0 et 1. */
  minScore: number;
  /** Détections ajoutées à la main (voir `AnalyzeOptions.manual` du moteur). */
  manual: Detection[];
  /** Identifiants globaux `<pack>/<règle>` des règles actives. */
  activeRuleIds: string[];
  /** Active la reconnaissance de noms (NER). Voir `ner-provider.ts`. */
  ner: boolean;
  /**
   * Formes de surface des entités PERSON de la session courante (voir `AnalyzeOptions.knownPersons`),
   * pour propager les noms d'un document à l'autre. Elles ne vont que vers le worker local (même
   * origine) et ne reviennent dans aucune réponse (R5).
   */
  knownPersons?: string[];
}

/** Demande d'annulation (coopérative ; le client force l'arrêt du worker au besoin). */
export interface CancelRequest {
  type: "cancel";
  id: number;
}

/**
 * D'où le worker lit les fichiers du modèle NER (ADR 0003).
 * - `cache` (défaut) : Cache Storage, lu directement par le worker : aucun octet du modèle ne transite.
 * - `memory` : Cache Storage indisponible ; les `Blob` (références vers les fichiers du disque, pas des
 *   copies) sont transmis une fois par structured clone.
 * - `dev` : dossier `models/` servi par Vite, développement seulement.
 */
export type ModelSourceSpec =
  | { kind: "cache" }
  | { kind: "dev" }
  | { kind: "memory"; files: [string, Blob][]; dtype: "q8" | "fp32"; name: string };

/** Change la source du modèle : le moteur NER en mémoire est abandonné et rechargé au besoin. */
export interface SetModelRequest {
  type: "set-model";
  model: ModelSourceSpec;
}

export type WorkerRequest = AnalyzeRequest | CancelRequest | SetModelRequest;

export type AnalysisStage = "rules" | "ner";

export interface ProgressResponse {
  type: "progress";
  id: number;
  stage: AnalysisStage;
  /** Entre 0 et 1. */
  progress: number;
}

/**
 * Issue du chargement du NER pour une requête `ner: true`.
 * `missing` : aucun modèle chargé par l'utilisateur ; `error` : fichiers illisibles ou incompatibles.
 */
export type NerStatus = "ready" | "missing" | "error";

export interface ResultResponse {
  type: "result";
  id: number;
  result: AnalysisResult;
  /** Présent seulement si la requête demandait le NER. */
  nerStatus?: NerStatus;
}

export type AnalysisErrorCode =
  /** Texte trop long, détection manuelle invalide. */
  | "invalid_input"
  /** Règle active inconnue, requête mal formée. */
  | "invalid_request"
  /** Pack livré invalide. */
  | "packs"
  /** Erreur inattendue ; message générique. */
  | "internal"
  /** Le worker a planté. */
  | "worker";

export interface ErrorResponse {
  type: "error";
  id: number;
  code: AnalysisErrorCode;
  /** Message en français, sans valeur du texte. */
  message: string;
}

export interface CancelledResponse {
  type: "cancelled";
  id: number;
}

export type WorkerResponse = ProgressResponse | ResultResponse | ErrorResponse | CancelledResponse;
