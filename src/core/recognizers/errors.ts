import { MAX_INPUT_LENGTH } from "../types/index.ts";

/** Erreur levée quand l'analyse est annulée via `AbortSignal`. */
export class AbortError extends Error {
  override name = "AbortError";
  constructor() {
    super("Analyse annulée.");
  }
}

/** Nombre d'itérations entre deux vérifications du signal. */
export const ABORT_CHECK_INTERVAL = 64;

export function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new AbortError();
}

/** Refuse un texte trop long. Le message ne contient jamais le texte (R5). */
export function assertInputLength(text: string): void {
  if (text.length > MAX_INPUT_LENGTH) {
    throw new RangeError(
      `Texte trop long : ${text.length} unités UTF-16 (maximum ${MAX_INPUT_LENGTH}).`,
    );
  }
}

/** Formate un score à la française pour les explications (0,5). */
export function formatScore(score: number): string {
  return String(Math.round(score * 1000) / 1000).replace(".", ",");
}
