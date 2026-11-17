/**
 * Web Worker module hébergeant le moteur NER. Il ne communique qu'avec la page qui l'a créé
 * (même origine) ; voir `protocol.ts`. Création : `createWorkerNerEngine()` dans `worker-client.ts`.
 */
import { createNerWorkerHost } from "./worker-host.ts";
import type { NerRequest, NerResponse } from "./protocol.ts";
import { TransformersNerEngine } from "./transformers-engine.ts";

interface WorkerScope {
  postMessage(message: NerResponse): void;
  onmessage: ((event: { data: NerRequest }) => void) | null;
}
// `self` est typé Window ou WorkerGlobalScope selon les libs : on le restreint à ce qui sert ici.
const scope = self as unknown as WorkerScope;

const host = createNerWorkerHost({
  post: (message) => scope.postMessage(message),
  createEngine: (options) => new TransformersNerEngine(options),
});

scope.onmessage = (event) => host.handle(event.data);
