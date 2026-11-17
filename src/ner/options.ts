/** Options du moteur NER. Sérialisables : elles transitent par `postMessage` vers le worker. */

export type NerDtype = "q8" | "int8" | "uint8" | "fp16" | "fp32";

/** `cpu` sert sous Node (onnxruntime-node) ; dans le navigateur, `wasm` ou `webgpu`. */
export type NerDevice = "wasm" | "webgpu" | "cpu";

/** Chemins des fichiers WASM d'ONNX Runtime Web. */
export type NerWasmPaths = string | { mjs: string; wasm: string };

export interface TransformersNerEngineOptions {
  /** Identifiant du modèle, relatif à `localModelPath`. Défaut : `DEFAULT_NER_MODEL`. */
  modelId?: string;
  /** Dossier des modèles, servi par l'application elle-même (R4). Défaut : `/models/`. */
  localModelPath?: string;
  /** Précision des poids. Défaut : `q8`. */
  dtype?: NerDtype;
  /** Défaut : `wasm`. */
  device?: NerDevice;
  /** Score moyen minimal d'une entité, entre 0 et 1. Défaut : 0,5. */
  minScore?: number;
  /** Taille maximale d'un segment, en unités UTF-16. Défaut : 1000. */
  segmentChars?: number;
  /** Recouvrement entre segments, en unités UTF-16. Défaut : 100. */
  segmentOverlap?: number;
  /**
   * Emplacement des fichiers WASM d'ONNX Runtime Web (R1).
   *
   * Par défaut, Transformers.js les télécharge depuis un CDN (cdn.jsdelivr.net) : c'est interdit.
   * Il faut les servir depuis l'origine de l'application et les désigner ici, par exemple
   * `{ mjs: "https://app.example/ort/ort-wasm-simd-threaded.asyncify.mjs", wasm: ".../....wasm" }`
   * (URL absolues). Si l'option est omise et qu'on s'exécute dans un navigateur ou un worker, le
   * moteur utilise `<origine>/ort/ort-wasm-simd-threaded.asyncify.{mjs,wasm}`. Sous Node, l'option
   * est ignorée tant qu'elle n'est pas donnée.
   */
  wasmPaths?: NerWasmPaths;
}

export const DEFAULT_NER_MODEL = "Xenova/distilbert-base-multilingual-cased-ner-hrl";
export const DEFAULT_LOCAL_MODEL_PATH = "/models/";
export const DEFAULT_MIN_SCORE = 0.5;
