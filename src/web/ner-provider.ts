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
 * Réseau (R1, R4) : tout vient de l'origine de l'application, ou du disque de l'utilisateur.
 * - Modèle : il n'est pas livré (ADR 0003). L'utilisateur le charge depuis son disque ; il est conservé
 *   dans Cache Storage (`lessive-models-v1`) et lu ici par `env.customCache` : aucune requête, la CSP
 *   n'est pas élargie. Seul le raccourci de développement lit `<racine>/models/` servi par Vite.
 * - WASM d'ONNX Runtime : `<racine>/ort/ort-wasm-simd-threaded.asyncify.{mjs,wasm}`.
 * - `useWasmCache = false` : par défaut Transformers.js recharge le `.mjs` d'ORT via une URL `blob:`
 *   puis l'importe, ce que la CSP (`script-src 'self' 'wasm-unsafe-eval'`) interdit. Désactivé, ORT
 *   importe le `.mjs` directement depuis l'origine.
 * - `numThreads = 1` : pas de workers internes d'ORT (qui exigeraient `blob:` dans la CSP et
 *   l'isolation cross-origin pour SharedArrayBuffer). La CSP reste donc inchangée.
 *
 * Si le modèle est absent, `LocalModelMissingError` ; s'il est illisible, une autre erreur. Dans les deux
 * cas `analysis-engine.ts` le transforme en avertissement.
 */
import type { NerEngine } from "../core/index.ts";
import { LocalModelMissingError, type LocalModelFileSource } from "../ner/local-files.ts";
import type { ModelSourceSpec } from "./analysis-protocol.ts";
import { blobFileSource, cacheFileSource } from "./model-store.ts";

export type NerProvider = (
  onProgress: (progress: number) => void,
  model?: ModelSourceSpec,
) => Promise<NerEngine | undefined>;

/**
 * Racine de l'application. Le script du worker est `<racine>/assets/….js` en production et
 * `<racine>/analysis.worker.ts` en développement : le dossier parent donne la racine dans les deux cas,
 * ce qui reste correct si l'application est hébergée dans un sous-dossier.
 */
function appRoot(): URL {
  return new URL("../", self.location.href);
}

async function resolveSource(
  spec: ModelSourceSpec,
  root: URL,
): Promise<{ source: LocalModelFileSource; dtype: "q8" | "fp32"; name: string }> {
  if (spec.kind === "memory") {
    return { source: blobFileSource(new Map(spec.files)), dtype: spec.dtype, name: spec.name };
  }
  if (spec.kind === "dev") {
    // Import dynamique derrière `import.meta.env.DEV` : absent du build de production.
    if (!import.meta.env.DEV) throw new LocalModelMissingError();
    const { DEV_MODEL_ID, devFileSource } = await import("./dev-model.ts");
    return { source: devFileSource(root), dtype: "q8", name: DEV_MODEL_ID };
  }
  const { info, source } = await cacheFileSource(root);
  return { source, dtype: info.dtype, name: info.name };
}

export const loadNerEngine: NerProvider = async (onProgress, model = { kind: "cache" }) => {
  const root = appRoot();
  // Avant d'importer Transformers.js (lourd) : un modèle absent échoue tout de suite.
  const { source, dtype, name } = await resolveSource(model, root);
  const { env } = await import("@huggingface/transformers");
  env.useWasmCache = false;
  const wasm = env.backends.onnx.wasm;
  if (wasm) wasm.numThreads = 1;

  const { TransformersNerEngine } = await import("../ner/transformers-engine.ts");
  const file = (ext: string) => new URL(`ort/ort-wasm-simd-threaded.asyncify.${ext}`, root).href;
  const engine = new TransformersNerEngine({
    device: "wasm",
    dtype,
    // Les fichiers viennent de `source` (cache personnalisé de Transformers.js), pas d'une URL :
    // le piège de 4.3.2 avec une URL http(s) en `localModelPath` (tokenizer omis sans erreur) ne se pose pas.
    modelFiles: source,
    modelLabel: name,
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
