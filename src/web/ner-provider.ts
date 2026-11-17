/**
 * Fournisseur du moteur NER pour le worker d'analyse (T5.1, branchement hors T5.1).
 *
 * Architecture : le moteur `TransformersNerEngine` tourne directement dans le worker d'analyse, qui
 * l'instancie au premier besoin (requête avec `ner: true`) et le garde en cache. Un seul worker :
 * pas de second `postMessage` du texte (donc pas de copie supplémentaire d'une donnée sensible,
 * R5), pas de second protocole, une seule annulation. Un worker NER dédié (`createWorkerNerEngine`)
 * n'apporterait que de l'isolation de plantage, au prix de cette complexité ; le worker d'analyse
 * est déjà hors du fil principal.
 *
 * Réseau (R1, R4) : tout vient de l'origine de l'application.
 * - Modèle : `<racine>/models/` (copié au build par `scripts/vite-plugin-local-assets.ts`).
 * - WASM d'ONNX Runtime : `<racine>/ort/ort-wasm-simd-threaded.asyncify.{mjs,wasm}`.
 * - `useWasmCache = false` : par défaut Transformers.js recharge le `.mjs` d'ORT via une URL `blob:`
 *   puis l'importe, ce que la CSP (`script-src 'self' 'wasm-unsafe-eval'`) interdit. Désactivé, ORT
 *   importe le `.mjs` directement depuis l'origine.
 * - `numThreads = 1` : pas de workers internes d'ORT (qui exigeraient `blob:` dans la CSP et
 *   l'isolation cross-origin pour SharedArrayBuffer). La CSP reste donc inchangée.
 *
 * Si le modèle est absent, `load()` rejette ; `analysis-engine.ts` le transforme en avertissement.
 */
import type { NerEngine } from "../core/index.ts";

export type NerProvider = (
  onProgress: (progress: number) => void,
) => Promise<NerEngine | undefined>;

/**
 * Racine de l'application. Le script du worker est `<racine>/assets/….js` en production et
 * `<racine>/analysis.worker.ts` en développement : le dossier parent donne la racine dans les deux cas,
 * ce qui reste correct si l'application est hébergée dans un sous-dossier.
 */
function appRoot(): URL {
  return new URL("../", self.location.href);
}

export const loadNerEngine: NerProvider = async (onProgress) => {
  const { env } = await import("@huggingface/transformers");
  env.useWasmCache = false;
  const wasm = env.backends.onnx.wasm;
  if (wasm) wasm.numThreads = 1;

  const { TransformersNerEngine } = await import("../ner/transformers-engine.ts");
  const root = appRoot();
  const file = (ext: string) => new URL(`ort/ort-wasm-simd-threaded.asyncify.${ext}`, root).href;
  const engine = new TransformersNerEngine({
    device: "wasm",
    // Chemin (pas URL absolue) : avec une URL http(s), Transformers.js 4.3.2 ne vérifie plus l'existence
    // de `tokenizer_config.json` quand `allowRemoteModels` est faux, omet le tokenizer sans erreur et
    // le pipeline plante ensuite (« this.tokenizer is not a function »). Mesuré dans Chrome.
    localModelPath: new URL("models/", root).pathname,
    wasmPaths: { mjs: file("mjs"), wasm: file("wasm") },
  });
  try {
    let last = -1;
    await engine.load((p) => {
      // Transformers.js répète la même valeur des dizaines de fois : on ne relaie que les changements.
      if (p !== last) onProgress((last = p));
    });
  } catch (err) {
    await engine.dispose().catch(() => undefined);
    throw err;
  }
  return engine;
};
