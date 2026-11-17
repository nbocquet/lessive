/**
 * État « Prêt hors ligne » (T6.2) : enregistre le service worker et expose son état.
 *
 * Aucun contenu de l'utilisateur ici : seulement l'état du service worker et des compteurs de
 * fichiers d'application mis en cache. L'affichage est à brancher dans l'interface :
 * `getOfflineState()` pour l'état courant, `subscribeOffline(cb)` ou l'événement
 * `OFFLINE_STATE_EVENT` (CustomEvent sur `window`, `detail` = OfflineState) pour les changements.
 */

export type OfflinePhase =
  /** Pas de service worker (développement, navigateur sans prise en charge, contexte non sécurisé). */
  | "unsupported"
  /** Enregistrement en cours, aucun fichier encore en cache. */
  | "installing"
  /** Application en cache ; fichiers lourds (ONNX Runtime) en cours ou en attente. */
  | "partial"
  | "caching"
  /** Tout est en cache : l'application fonctionne hors ligne. */
  | "ready"
  /** Un fichier n'a pas pu être mis en cache (réseau coupé, quota). */
  | "error";

export interface OfflineState {
  phase: OfflinePhase;
  cached: number;
  total: number;
}

export const OFFLINE_STATE_EVENT = "lessive:offline-state";

const PHASES: readonly OfflinePhase[] = ["partial", "caching", "ready", "error"];

let state: OfflineState = { phase: "unsupported", cached: 0, total: 0 };

export function getOfflineState(): OfflineState {
  return state;
}

function setState(next: OfflineState): void {
  if (next.phase === state.phase && next.cached === state.cached && next.total === state.total) {
    return;
  }
  state = next;
  window.dispatchEvent(new CustomEvent<OfflineState>(OFFLINE_STATE_EVENT, { detail: next }));
}

/** Appelle `callback` à chaque changement ; renvoie la fonction de désabonnement. */
export function subscribeOffline(callback: (state: OfflineState) => void): () => void {
  const listener = (event: Event) => callback((event as CustomEvent<OfflineState>).detail);
  window.addEventListener(OFFLINE_STATE_EVENT, listener);
  return () => window.removeEventListener(OFFLINE_STATE_EVENT, listener);
}

/** Message du service worker -> état, ou `undefined` si ce n'est pas un message de Lessive. */
export function parseOfflineMessage(data: unknown): OfflineState | undefined {
  if (typeof data !== "object" || data === null) return undefined;
  const m = data as Record<string, unknown>;
  if (m["type"] !== "lessive-offline") return undefined;
  const { phase, cached, total } = m;
  if (typeof cached !== "number" || typeof total !== "number") return undefined;
  if (!PHASES.includes(phase as OfflinePhase)) return undefined;
  return { phase: phase as OfflinePhase, cached, total };
}

/** Délai avant de lancer la mise en cache des gros fichiers : l'interface passe en premier. */
const BACKGROUND_DELAY_MS = 1500;

/** Enregistre le service worker (production uniquement). Ne bloque jamais l'interface. */
export function initOffline(): void {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
  const container = navigator.serviceWorker;
  setState({ phase: "installing", cached: 0, total: 0 });
  container.addEventListener("message", (event) => {
    const next = parseOfflineMessage(event.data);
    if (next) setState(next);
  });
  const start = async (): Promise<void> => {
    await container.register(new URL("sw.js", document.baseURI), { scope: "./" });
    const registration = await container.ready;
    const worker = registration.active;
    if (!worker) return;
    worker.postMessage({ type: "get-state" });
    setTimeout(() => worker.postMessage({ type: "precache-data" }), BACKGROUND_DELAY_MS);
  };
  const run = () => {
    start().catch(() => setState({ phase: "unsupported", cached: 0, total: 0 }));
  };
  if (document.readyState === "complete") run();
  else window.addEventListener("load", run, { once: true });
}
