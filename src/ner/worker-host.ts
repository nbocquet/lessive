/**
 * Logique du worker NER, séparée du `self` du worker pour être testable sans navigateur.
 * Les requêtes sont exécutées l'une après l'autre ; `cancel` agit aussi sur celles en attente.
 */
import type { AnalysisContext, Detection, NerEngine } from "../core/types/index.ts";
import type { TransformersNerEngineOptions } from "./options.ts";
import type { NerRequest, NerResponse, WireDetection, WireError } from "./protocol.ts";

export interface NerWorkerHostOptions {
  post: (message: NerResponse) => void;
  createEngine: (options: TransformersNerEngineOptions | undefined) => NerEngine;
}

/** Erreur dont le message est écrit ici et ne contient jamais de texte utilisateur. */
class HostError extends Error {}

/**
 * Erreur relayée sans le texte (R5). Le message d'une erreur de chargement est conservé (il ne
 * concerne que des fichiers de modèle) ; celui d'une analyse est remplacé par un message neutre.
 */
function toWireError(error: unknown, phase: "load" | "recognize"): WireError {
  const name = error instanceof Error ? error.name : "Error";
  if (name === "AbortError") return { name, message: "Analyse annulée." };
  if (error instanceof HostError || (phase === "load" && error instanceof Error))
    return { name, message: error.message };
  return {
    name,
    message: phase === "load" ? "Échec du chargement du modèle NER." : "Échec de l'analyse NER.",
  };
}

const abortError = (): Error =>
  Object.assign(new Error("Analyse annulée."), { name: "AbortError" });

export function createNerWorkerHost(host: NerWorkerHostOptions): {
  handle: (request: NerRequest) => void;
} {
  let engine: NerEngine | null = null;
  let queue: Promise<void> = Promise.resolve();
  const controllers = new Map<number, AbortController>();

  const enqueue = (
    id: number,
    phase: "load" | "recognize" | "dispose",
    task: () => Promise<void>,
  ) => {
    queue = queue.then(task).catch((error: unknown) => {
      host.post({
        type: "error",
        id,
        error: toWireError(error, phase === "load" ? "load" : "recognize"),
      });
    });
  };

  return {
    handle(request) {
      switch (request.type) {
        case "load":
          enqueue(request.id, "load", async () => {
            await engine?.dispose();
            engine = host.createEngine(request.options);
            await engine.load((progress) =>
              host.post({ type: "progress", id: request.id, progress }),
            );
            host.post({ type: "loaded", id: request.id });
          });
          break;
        case "recognize": {
          const controller = new AbortController();
          controllers.set(request.id, controller);
          enqueue(request.id, "recognize", async () => {
            try {
              if (controller.signal.aborted) throw abortError();
              if (!engine) throw new HostError("Moteur NER non chargé.");
              let counter = 0;
              const ctx: AnalysisContext = {
                language: request.language,
                signal: controller.signal,
                nextId: () => String(++counter),
              };
              const detections = await engine.recognize(request.text, ctx);
              const wire: WireDetection[] = detections.map((d: Detection) => {
                const copy: Partial<Detection> = { ...d };
                delete copy.id;
                return copy as WireDetection;
              });
              host.post({ type: "result", id: request.id, detections: wire });
            } finally {
              controllers.delete(request.id);
            }
          });
          break;
        }
        case "cancel":
          controllers.get(request.id)?.abort();
          break;
        case "dispose":
          for (const c of controllers.values()) c.abort();
          enqueue(request.id, "dispose", async () => {
            const current = engine;
            engine = null;
            await current?.dispose();
            host.post({ type: "disposed", id: request.id });
          });
          break;
      }
    },
  };
}
