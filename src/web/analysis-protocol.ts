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
}

/** Demande d'annulation (coopérative ; le client force l'arrêt du worker au besoin). */
export interface CancelRequest {
  type: "cancel";
  id: number;
}

export type WorkerRequest = AnalyzeRequest | CancelRequest;

export type AnalysisStage = "rules" | "ner";

export interface ProgressResponse {
  type: "progress";
  id: number;
  stage: AnalysisStage;
  /** Entre 0 et 1. */
  progress: number;
}

export interface ResultResponse {
  type: "result";
  id: number;
  result: AnalysisResult;
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
