/** Adaptation Node du modèle local ; aucun accès réseau ni cache persistant. */
import { constants } from "node:fs";
import { open, realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import type { NerEngine } from "../core/types/index.ts";
import type { LocalModelFileSource } from "../ner/local-files.ts";

export class CliNerError extends Error {
  constructor() {
    super(
      "Impossible de charger le modèle local ou le runtime CPU. Vérifiez les fichiers q8 et le runtime installé (NER_LOAD).",
    );
    this.name = "CliNerError";
  }
}

function inside(root: string, path: string): boolean {
  const part = relative(root, path);
  return part !== "" && part !== ".." && !part.startsWith(`..${sep}`) && !isAbsolute(part);
}

/** Chaque lecture vérifie aussi la cible réelle des liens symboliques. */
export async function createModelFileSource(directory: string): Promise<LocalModelFileSource> {
  const root = await realpath(directory);
  if (!(await stat(root)).isDirectory()) throw new CliNerError();
  return async (name) => {
    if (name.includes("\\") || name.includes("\0") || isAbsolute(name)) throw new CliNerError();
    const candidate = resolve(root, name);
    if (!inside(root, candidate)) throw new CliNerError();
    let target: string;
    try {
      target = await realpath(candidate);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw new CliNerError();
    }
    if (!inside(root, target)) throw new CliNerError();
    const handle = await open(
      target,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
    try {
      const info = await handle.stat();
      if (!info.isFile()) throw new CliNerError();
      const data = await handle.readFile();
      return new Response(new Uint8Array(data), {
        headers: { "content-length": String(data.byteLength) },
      });
    } finally {
      await handle.close();
    }
  };
}

/** Le CLI doit refuser la ligne si l'analyseur absorbe un échec NER. */
export function guardNer(engine: NerEngine): NerEngine & { failed: boolean } {
  return {
    failed: false,
    load: (progress) => engine.load(progress),
    async recognize(text, context) {
      try {
        return await engine.recognize(text, context);
      } catch {
        this.failed = true;
        throw new CliNerError();
      }
    },
    dispose: () => engine.dispose(),
  };
}

export async function loadNer(directory: string): Promise<NerEngine> {
  let engine: NerEngine | undefined;
  try {
    const source = await createModelFileSource(directory);
    // Valider les fichiers indispensables avant d'importer le runtime facultatif.
    for (const name of [
      "config.json",
      "tokenizer.json",
      "tokenizer_config.json",
      "onnx/model_quantized.onnx",
    ]) {
      const response = await source(name);
      if (!response) throw new CliNerError();
    }
    const { env, LogLevel } = await import("@huggingface/transformers");
    env.allowRemoteModels = false;
    env.useFS = false;
    env.useFSCache = false;
    env.useBrowserCache = false;
    env.logLevel = LogLevel.NONE;
    // Les fichiers facultatifs absents sont des 404 locaux, jamais des requêtes.
    env.fetch = () => Promise.resolve(new Response(null, { status: 404 }));
    const { TransformersNerEngine } = await import("../ner/transformers-engine.ts");
    engine = new TransformersNerEngine({ modelFiles: source, device: "cpu", dtype: "q8" });
    await engine.load();
    return engine;
  } catch {
    await engine?.dispose().catch(() => undefined);
    throw new CliNerError();
  }
}
