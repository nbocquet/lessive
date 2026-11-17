/**
 * Worker d'analyse (T5.1) : exécute le moteur hors du fil principal.
 * Toute la logique est dans `analysis-engine.ts` ; protocole : `analysis-protocol.ts`.
 * Aucun accès réseau (R1) : les packs sont dans le bundle (`packs.ts`).
 */
import { createAnalysisHandler } from "./analysis-engine.ts";
import type { WorkerRequest, WorkerResponse } from "./analysis-protocol.ts";
import { loadNerEngine } from "./ner-provider.ts";
import { loadBundledRegistry } from "./packs.ts";

const scope = self as unknown as {
  postMessage(message: WorkerResponse): void;
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
};

const handler = createAnalysisHandler(
  loadBundledRegistry,
  (response) => scope.postMessage(response),
  loadNerEngine,
);

scope.onmessage = (event) => handler.handle(event.data);
