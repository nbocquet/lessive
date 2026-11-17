/**
 * Client du worker d'analyse, côté page (T5.1).
 *
 * `AnalysisService` est l'interface que l'état utilise : les tests la remplacent
 * par un faux service. `AnalysisClient` crée le worker au premier appel (pas à
 * l'import) et le recrée s'il a dû être arrêté.
 *
 * Annulation : `cancel()` rejette aussitôt la promesse avec `AnalysisCancelledError`,
 * envoie un message `cancel` au worker et, si le worker n'a pas accusé réception
 * après `CANCEL_GRACE_MS` (calcul synchrone en cours), le termine et le recrée.
 */
import type { AnalysisResult } from "../core/index.ts";
import type {
  AnalysisErrorCode,
  AnalysisStage,
  AnalyzeRequest,
  ModelSourceSpec,
  NerStatus,
  WorkerRequest,
  WorkerResponse,
} from "./analysis-protocol.ts";

/** Paramètres d'une analyse (la requête sans `type` ni `id`). */
export type AnalyzeParams = Omit<AnalyzeRequest, "type" | "id">;

export type ProgressListener = (stage: AnalysisStage, progress: number) => void;

export interface AnalysisJob {
  /** Rejetée par `AnalysisCancelledError` ou `AnalysisFailure`. */
  readonly result: Promise<AnalysisResult>;
  cancel(): void;
}

/** Issue du chargement du NER pour une analyse (voir `NerStatus`). */
export type NerStatusListener = (status: NerStatus) => void;

export interface AnalysisService {
  start(
    params: AnalyzeParams,
    onProgress?: ProgressListener,
    onNerStatus?: NerStatusListener,
  ): AnalysisJob;
  /** Indique d'où lire le modèle NER (ADR 0003). Facultatif : absent des faux services de test. */
  setModel?(model: ModelSourceSpec): void;
  dispose(): void;
}

export class AnalysisCancelledError extends Error {
  constructor() {
    super("Analyse annulée.");
    this.name = "AnalysisCancelledError";
  }
}

/** Échec d'analyse ; `message` ne contient jamais de valeur du texte (R5). */
export class AnalysisFailure extends Error {
  constructor(
    readonly code: AnalysisErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AnalysisFailure";
  }
}

/** Sous-ensemble de `Worker` utilisé ici (permet un worker de test). */
export interface WorkerLike {
  postMessage(message: WorkerRequest): void;
  terminate(): void;
  onmessage: ((event: { data: WorkerResponse }) => void) | null;
  onerror: ((event: unknown) => void) | null;
}

export const CANCEL_GRACE_MS = 1000;

function createDefaultWorker(): WorkerLike {
  // Le motif `new Worker(new URL(...), { type: "module" })` est reconnu par Vite.
  return new Worker(new URL("./analysis.worker.ts", import.meta.url), {
    type: "module",
  }) as unknown as WorkerLike;
}

interface Pending {
  resolve(result: AnalysisResult): void;
  reject(error: Error): void;
  onProgress: ProgressListener | undefined;
  onNerStatus: NerStatusListener | undefined;
  /** Vrai après `cancel()` : la promesse est déjà rejetée. */
  cancelled: boolean;
  graceTimer: ReturnType<typeof setTimeout> | undefined;
}

export class AnalysisClient implements AnalysisService {
  readonly #createWorker: () => WorkerLike;
  #worker: WorkerLike | undefined;
  #nextId = 1;
  /** Dernière source de modèle indiquée : renvoyée à tout worker recréé. */
  #model: ModelSourceSpec | undefined;
  readonly #pending = new Map<number, Pending>();

  constructor(createWorker: () => WorkerLike = createDefaultWorker) {
    this.#createWorker = createWorker;
  }

  setModel(model: ModelSourceSpec): void {
    this.#model = model;
    this.#worker?.postMessage({ type: "set-model", model });
  }

  start(
    params: AnalyzeParams,
    onProgress?: ProgressListener,
    onNerStatus?: NerStatusListener,
  ): AnalysisJob {
    const id = this.#nextId++;
    const worker = this.#ensureWorker();
    const result = new Promise<AnalysisResult>((resolve, reject) => {
      this.#pending.set(id, {
        resolve,
        reject,
        onProgress,
        onNerStatus,
        cancelled: false,
        graceTimer: undefined,
      });
    });
    worker.postMessage({ type: "analyze", id, ...params });
    return { result, cancel: () => this.#cancel(id) };
  }

  dispose(): void {
    this.#killWorker(new AnalysisCancelledError());
  }

  #ensureWorker(): WorkerLike {
    if (this.#worker) return this.#worker;
    const worker = this.#createWorker();
    worker.onmessage = (event) => this.#onResponse(event.data);
    worker.onerror = () => {
      // Le détail de l'événement d'erreur est ignoré : il pourrait citer le texte (R5).
      this.#killWorker(
        new AnalysisFailure("worker", "Le worker d'analyse a rencontré une erreur."),
      );
    };
    this.#worker = worker;
    if (this.#model) worker.postMessage({ type: "set-model", model: this.#model });
    return worker;
  }

  #killWorker(reason: Error): void {
    this.#worker?.terminate();
    this.#worker = undefined;
    for (const [id, p] of this.#pending) {
      clearTimeout(p.graceTimer);
      this.#pending.delete(id);
      p.reject(p.cancelled ? new AnalysisCancelledError() : reason);
    }
  }

  #cancel(id: number): void {
    const p = this.#pending.get(id);
    if (!p || p.cancelled) return;
    p.cancelled = true;
    p.reject(new AnalysisCancelledError());
    this.#worker?.postMessage({ type: "cancel", id });
    p.graceTimer = setTimeout(() => {
      // Worker occupé par un calcul synchrone : arrêt forcé ; les autres analyses en cours sont rejetées.
      if (this.#pending.has(id)) {
        this.#killWorker(new AnalysisFailure("worker", "Le worker d'analyse a été redémarré."));
      }
    }, CANCEL_GRACE_MS);
  }

  #onResponse(msg: WorkerResponse): void {
    const p = this.#pending.get(msg.id);
    if (!p) return;
    if (msg.type === "progress") {
      if (!p.cancelled) p.onProgress?.(msg.stage, msg.progress);
      return;
    }
    clearTimeout(p.graceTimer);
    this.#pending.delete(msg.id);
    if (p.cancelled) return; // promesse déjà rejetée
    if (msg.type === "result") {
      if (msg.nerStatus) p.onNerStatus?.(msg.nerStatus);
      p.resolve(msg.result);
    } else if (msg.type === "cancelled") p.reject(new AnalysisCancelledError());
    else p.reject(new AnalysisFailure(msg.code, msg.message));
  }
}
