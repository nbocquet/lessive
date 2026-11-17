// Worker : charge le modèle depuis /models/ et exécute le pipeline. Aucun accès réseau externe.
import { pipeline, env } from "@huggingface/transformers";
import { predictText, buildLongText, groupRawTokens } from "../lib.mjs";

env.allowRemoteModels = false; // R4
env.allowLocalModels = true;
env.localModelPath = "/models/";
env.useBrowserCache = false; // on mesure un vrai chargement ; le cache fausserait le temps
env.useWasmCache = false;
// Par défaut, Transformers.js va chercher les fichiers WASM sur un CDN : on force l'origine locale.
const ort = (f) => new URL(`/ort/${f}`, self.location.origin).href;
env.backends.onnx.wasm.wasmPaths = {
  mjs: ort("ort-wasm-simd-threaded.asyncify.mjs"),
  wasm: ort("ort-wasm-simd-threaded.asyncify.wasm"),
};

let classify = null;

const externalRequests = () =>
  performance
    .getEntriesByType("resource")
    .map((e) => e.name)
    .filter((n) => !n.startsWith(self.location.origin));

self.onmessage = async ({ data }) => {
  try {
    if (data.type === "load") {
      env.backends.onnx.wasm.numThreads = data.threads;
      const t0 = performance.now();
      const pipe = await pipeline("token-classification", data.model, { dtype: data.dtype, device: data.device });
      const loadMs = performance.now() - t0;
      // Pas d'agrégation Transformers.js : avec un étiquetage IO (I-PER seul, sans B-), elle fusionne
      // deux entités séparées par d'autres mots. On regroupe nous-mêmes selon la contiguïté des jetons.
      classify = (text) => pipe(text).then(groupRawTokens);
      self.postMessage({
        type: "loaded",
        loadMs,
        isolated: self.crossOriginIsolated === true,
        numThreads: env.backends.onnx.wasm.numThreads,
        external: externalRequests(),
      });
    } else if (data.type === "run") {
      const t0 = performance.now();
      const r = await predictText(data.text, classify, { chunkSize: 1000 });
      const ms = performance.now() - t0;
      self.postMessage({ type: "result", ms, spans: r.spans, unlocated: r.unlocated, external: externalRequests() });
    } else if (data.type === "run5000") {
      const text = buildLongText(data.texts, 5000);
      const times = [];
      for (let i = 0; i < 3; i++) {
        const t0 = performance.now();
        await predictText(text, classify, { chunkSize: 1000 });
        times.push(performance.now() - t0);
      }
      self.postMessage({ type: "result5000", times, chars: text.length, external: externalRequests() });
    }
  } catch (e) {
    self.postMessage({ type: "error", message: e instanceof Error ? e.message : String(e) });
  }
};
