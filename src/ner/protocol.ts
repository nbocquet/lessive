/**
 * Protocole de messages entre la page et le worker NER (même origine, R1).
 * Le texte analysé n'apparaît que dans `recognize` (requête) ; aucune réponse ne le contient (R5).
 */
import type { Detection, Language } from "../core/types/index.ts";
import type { TransformersNerEngineOptions } from "./options.ts";

/** Détection sans identifiant : la page attribue les siens avec `ctx.nextId`. */
export type WireDetection = Omit<Detection, "id">;

/** Erreur relayée : nom et message, jamais le texte de l'utilisateur. */
export interface WireError {
  name: string;
  message: string;
}

/** Page vers worker. `id` identifie la requête ; pour `cancel`, c'est celle à annuler. */
export type NerRequest =
  | { type: "load"; id: number; options?: TransformersNerEngineOptions }
  | { type: "recognize"; id: number; text: string; language?: Language }
  | { type: "cancel"; id: number }
  | { type: "dispose"; id: number };

/** Worker vers page. */
export type NerResponse =
  | { type: "progress"; id: number; progress: number }
  | { type: "loaded"; id: number }
  | { type: "result"; id: number; detections: WireDetection[] }
  | { type: "disposed"; id: number }
  | { type: "error"; id: number; error: WireError };
