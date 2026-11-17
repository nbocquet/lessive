/**
 * Moteur NER côté page : `WorkerNerEngine` parle au worker (`ner.worker.ts`) par messages typés.
 * Le texte ne sort pas de l'origine : le worker est local (R1).
 */
import type { AnalysisContext, Detection, NerEngine } from "../core/types/index.ts";
import { AbortError } from "../core/recognizers/index.ts";
import type { TransformersNerEngineOptions } from "./options.ts";
import type { NerRequest, NerResponse, WireError } from "./protocol.ts";

/** Ce dont le client a besoin d'un worker : `Worker` (via `createWorkerNerEngine`) ou un faux. */
export interface NerWorkerLike {
  postMessage(message: NerRequest): void;
  onmessage: ((event: { data: NerResponse }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  terminate?(): void;
}

interface Pending {
  resolve: (response: NerResponse) => void;
  reject: (error: Error) => void;
  onProgress?: (progress: number) => void;
}

function fromWireError(error: WireError): Error {
  if (error.name === "AbortError") return new AbortError();
  return Object.assign(new Error(error.message), { name: error.name });
}

export class WorkerNerEngine implements NerEngine {
  private readonly worker: NerWorkerLike;
  private readonly options: TransformersNerEngineOptions | undefined;
  private readonly pending = new Map<number, Pending>();
  private nextRequestId = 1;
  private loading: Promise<void> | null = null;
  private disposed = false;

  constructor(worker: NerWorkerLike, options?: TransformersNerEngineOptions) {
    this.worker = worker;
    this.options = options;
    worker.onmessage = (event) => this.onMessage(event.data);
    worker.onerror = () => this.failAll(new Error("Le worker NER a rencontré une erreur."));
  }

  private onMessage(message: NerResponse): void {
    const entry = this.pending.get(message.id);
    if (!entry) return; // requête annulée ou terminée : réponse tardive ignorée
    if (message.type === "progress") {
      entry.onProgress?.(message.progress);
      return;
    }
    this.pending.delete(message.id);
    if (message.type === "error") entry.reject(fromWireError(message.error));
    else entry.resolve(message);
  }

  private failAll(error: Error): void {
    const entries = [...this.pending.values()];
    this.pending.clear();
    for (const entry of entries) entry.reject(error);
  }

  private assertUsable(): void {
    if (this.disposed) throw new Error("Le moteur NER a été libéré.");
  }

  /** Envoie une requête et attend sa réponse finale. */
  private request(
    build: (id: number) => NerRequest,
    onProgress?: (progress: number) => void,
    signal?: AbortSignal,
  ): Promise<NerResponse> {
    const id = this.nextRequestId++;
    return new Promise<NerResponse>((resolve, reject) => {
      if (signal?.aborted) {
        reject(new AbortError());
        return;
      }
      const onAbort = () => {
        if (!this.pending.delete(id)) return;
        this.worker.postMessage({ type: "cancel", id });
        reject(new AbortError());
      };
      signal?.addEventListener("abort", onAbort, { once: true });
      const done = () => signal?.removeEventListener("abort", onAbort);
      this.pending.set(id, {
        resolve: (r) => {
          done();
          resolve(r);
        },
        reject: (e) => {
          done();
          reject(e);
        },
        onProgress,
      });
      this.worker.postMessage(build(id));
    });
  }

  load(onProgress?: (progress: number) => void): Promise<void> {
    if (this.disposed) return Promise.reject(new Error("Le moteur NER a été libéré."));
    this.loading ??= this.request((id) => ({ type: "load", id, options: this.options }), onProgress)
      .then(() => undefined)
      .catch((error: unknown) => {
        this.loading = null;
        throw error;
      });
    return this.loading;
  }

  async recognize(text: string, ctx: AnalysisContext): Promise<Detection[]> {
    this.assertUsable();
    const response = await this.request(
      (id) => ({ type: "recognize", id, text, language: ctx.language }),
      undefined,
      ctx.signal,
    );
    if (response.type !== "result") throw new Error("Réponse inattendue du worker NER.");
    return response.detections.map((d) => ({ ...d, id: ctx.nextId() }));
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    this.loading = null;
    try {
      // Les requêtes en cours sont annulées côté worker puis rejetées ici.
      const waiting = [...this.pending.values()];
      this.pending.clear();
      for (const entry of waiting) entry.reject(new AbortError());
      await this.request((id) => ({ type: "dispose", id }));
    } catch {
      // Un worker déjà en échec ne peut plus répondre : on le termine quand même.
    } finally {
      this.worker.terminate?.();
    }
  }
}

/**
 * Crée le worker module (même origine) et le moteur qui le pilote. À appeler depuis la page ;
 * Vite emballe `ner.worker.ts` dans un fichier séparé.
 */
export function createWorkerNerEngine(options?: TransformersNerEngineOptions): WorkerNerEngine {
  const worker = new Worker(new URL("./ner.worker.ts", import.meta.url), { type: "module" });
  const adapter: NerWorkerLike = {
    postMessage: (message) => worker.postMessage(message),
    onmessage: null,
    onerror: null,
    terminate: () => worker.terminate(),
  };
  worker.onmessage = (event: MessageEvent<NerResponse>) =>
    adapter.onmessage?.({ data: event.data });
  worker.onerror = (event) => adapter.onerror?.(event);
  return new WorkerNerEngine(adapter, options);
}
