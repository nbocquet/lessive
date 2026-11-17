/**
 * Moteur NER fondé sur Transformers.js (`NerEngine`, T3.1 et T3.2).
 *
 * Les modèles sont lus uniquement depuis les fichiers locaux de l'application (R4). Le pipeline
 * est appelé sans `aggregation_strategy` : les jetons bruts sont regroupés par contiguïté
 * (`postprocess.ts`), puis les positions sont reconstruites sur le texte original (R7).
 */
import type { AnalysisContext, Detection, NerEngine } from "../core/types/index.ts";
import {
  DEFAULT_LOCAL_MODEL_PATH,
  DEFAULT_MIN_SCORE,
  DEFAULT_NER_MODEL,
  type NerWasmPaths,
  type TransformersNerEngineOptions,
} from "./options.ts";
import { LOCAL_MODEL_ID, createLocalModelCache } from "./local-files.ts";
import {
  buildDetections,
  createProgressTracker,
  recognizeSegments,
  type Classifier,
  type LoadProgressEvent,
  type RawToken,
} from "./postprocess.ts";

export { DEFAULT_NER_MODEL } from "./options.ts";

/** Marque l'enveloppe de `env.fetch` posée une seule fois (voir `blockLocalModelRequests`). */
let fetchGuarded = false;

/**
 * Avec des fichiers fournis par l'utilisateur, un fichier facultatif absent (par exemple
 * `special_tokens_map.json`) ferait tomber Transformers.js sur une requête vers
 * `<localModelPath>/lessive/local-model/…`. On la remplace par un 404 local : aucune requête ne part,
 * et le fichier est traité comme absent. Les autres requêtes passent par le `fetch` d'origine.
 */
function blockLocalModelRequests(env: {
  fetch: (input: never, init?: never) => Promise<Response>;
}) {
  if (fetchGuarded) return;
  fetchGuarded = true;
  const original = env.fetch;
  env.fetch = ((input: unknown, init?: unknown) =>
    typeof input === "string" && input.includes(`/${LOCAL_MODEL_ID}/`)
      ? Promise.resolve(new Response(null, { status: 404 }))
      : original(input as never, init as never)) as typeof env.fetch;
}

/** Sous-ensemble du pipeline utilisé ici (les types de Transformers.js sont trop larges). */
interface TokenClassificationPipeline {
  (text: string): Promise<RawToken[]>;
  dispose?: () => Promise<void>;
}

/** Fichiers WASM servis par l'origine courante, si on tourne dans un navigateur ou un worker. */
function defaultWasmPaths(): NerWasmPaths | undefined {
  const loc = (globalThis as { location?: { origin?: string; protocol?: string } }).location;
  if (!loc?.origin || !/^https?:$/.test(loc.protocol ?? "")) return undefined;
  const file = (ext: string) =>
    new URL(`/ort/ort-wasm-simd-threaded.asyncify.${ext}`, loc.origin).href;
  return { mjs: file("mjs"), wasm: file("wasm") };
}

export class TransformersNerEngine implements NerEngine {
  readonly modelId: string;
  private readonly options: TransformersNerEngineOptions;
  private pipe: TokenClassificationPipeline | null = null;
  private loading: Promise<void> | null = null;

  constructor(options: TransformersNerEngineOptions = {}) {
    this.options = options;
    this.modelId = options.modelFiles ? LOCAL_MODEL_ID : (options.modelId ?? DEFAULT_NER_MODEL);
  }

  load(onProgress?: (progress: number) => void): Promise<void> {
    if (this.pipe) {
      onProgress?.(1);
      return Promise.resolve();
    }
    this.loading ??= this.doLoad(onProgress).catch((error: unknown) => {
      this.loading = null;
      throw error;
    });
    return this.loading;
  }

  private async doLoad(onProgress?: (progress: number) => void): Promise<void> {
    const { pipeline, env } = await import("@huggingface/transformers");
    // R4 : jamais de téléchargement de modèle.
    env.allowRemoteModels = false;
    env.allowLocalModels = true;
    env.localModelPath = this.options.localModelPath ?? DEFAULT_LOCAL_MODEL_PATH;
    if (this.options.modelFiles) {
      // Fichiers choisis par l'utilisateur : lus par le cache personnalisé, jamais par le réseau (ADR 0003).
      env.useCustomCache = true;
      env.customCache = createLocalModelCache(this.options.modelFiles);
      env.useBrowserCache = false;
      blockLocalModelRequests(env as never);
    } else {
      env.useCustomCache = false;
      env.customCache = null;
    }
    // R1 : les fichiers WASM d'ONNX Runtime viennent de l'origine locale, pas du CDN par défaut.
    const wasmPaths = this.options.wasmPaths ?? defaultWasmPaths();
    const wasm = env.backends.onnx.wasm;
    if (wasmPaths !== undefined && wasm) wasm.wasmPaths = wasmPaths;

    const track = createProgressTracker();
    onProgress?.(0);
    const pipe = (await pipeline("token-classification", this.modelId, {
      dtype: this.options.dtype ?? "q8",
      device: this.options.device ?? "wasm",
      progress_callback: (event: LoadProgressEvent) => {
        const p = track(event);
        if (p !== null) onProgress?.(p);
      },
    })) as unknown as TokenClassificationPipeline;
    this.pipe = pipe;
    onProgress?.(1);
  }

  async recognize(text: string, ctx: AnalysisContext): Promise<Detection[]> {
    const pipe = this.pipe;
    if (!pipe) throw new Error("Le modèle NER n'est pas chargé : appeler load() d'abord.");
    // Sans agrégation : voir le commentaire du module.
    const classify: Classifier = (segment) => pipe(segment);
    const spans = await recognizeSegments(text, classify, {
      maxChars: this.options.segmentChars,
      overlap: this.options.segmentOverlap,
      minScore: this.options.minScore ?? DEFAULT_MIN_SCORE,
      signal: ctx.signal,
    });
    return buildDetections(spans, this.options.modelLabel ?? this.modelId, ctx.nextId);
  }

  async dispose(): Promise<void> {
    const pipe = this.pipe;
    this.pipe = null;
    this.loading = null;
    await pipe?.dispose?.();
  }
}
