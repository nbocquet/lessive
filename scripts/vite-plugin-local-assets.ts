/**
 * Plugin Vite local, sans dépendance : sert et copie les fichiers qui doivent venir de l'origine
 * de l'application (R1, R4).
 *
 * - `/ort/` : fichiers WASM d'ONNX Runtime Web réellement demandés par Transformers.js 4.3.2
 *   (variante « asyncify », voir `src/ner/transformers-engine.ts`), pris dans `node_modules`.
 * - `/models/Xenova/distilbert-base-multilingual-cased-ner-hrl/` : DÉVELOPPEMENT SEULEMENT (`vite dev`).
 *   Le modèle n'est pas livré (ADR 0003) : ni copié dans `dist/`, ni servi par `vite preview`. En
 *   développement, s'il est présent dans `models/`, il alimente le bouton « Utiliser le modèle de
 *   développement ». Absent, le serveur répond 404 (jamais la page d'accueil en repli).
 * - `/models/bundled/` : modèle fourni (ADR 0004), seulement si `LESSIVE_BUNDLED_MODEL` désigne son
 *   dossier. Vérifié (SHA-256) puis copié dans `dist/` au build, servi tel quel en développement.
 */
import { createReadStream, cpSync, existsSync, statSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";
import {
  ENV_VAR,
  LICENSE_SOURCE,
  manifestFor,
  readDescriptor,
  verifyModelDir,
  writeBundle,
} from "./bundled-model.ts";

const REPO = fileURLToPath(new URL("..", import.meta.url));
const ORT_DIR = join(REPO, "node_modules", "onnxruntime-web", "dist");
const ORT_FILES = ["ort-wasm-simd-threaded.asyncify.mjs", "ort-wasm-simd-threaded.asyncify.wasm"];
const MODEL_ID = "Xenova/distilbert-base-multilingual-cased-ner-hrl";
const MODELS_DIR = join(REPO, "models");
const BUNDLED_PREFIX = "/models/bundled/";

/** Dossier du modèle fourni, ou `undefined` si le build n'en inclut pas. */
function bundledDir(): string | undefined {
  const dir = process.env[ENV_VAR];
  return dir ? resolve(dir) : undefined;
}

const MIME: Record<string, string> = {
  ".mjs": "text/javascript",
  ".json": "application/json",
  ".wasm": "application/wasm",
  ".onnx": "application/octet-stream",
  ".txt": "text/plain; charset=utf-8",
};

/** Dossier réel d'une URL `/ort/…` ou `/models/…`, ou `undefined` si elle ne sort pas de la liste blanche. */
function resolveAsset(pathname: string): string | undefined {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return undefined;
  }
  if (decoded.startsWith("/ort/")) {
    const name = decoded.slice("/ort/".length);
    return ORT_FILES.includes(name) ? join(ORT_DIR, name) : undefined;
  }
  const bundled = bundledDir();
  if (bundled && decoded.startsWith(BUNDLED_PREFIX)) {
    const name = decoded.slice(BUNDLED_PREFIX.length);
    const descriptor = readDescriptor();
    if (name === descriptor.licenseFile) return LICENSE_SOURCE;
    return descriptor.files.some((f) => f.name === name) ? join(bundled, name) : undefined;
  }
  const prefix = `/models/${MODEL_ID}/`;
  if (decoded.startsWith(prefix)) {
    const root = join(MODELS_DIR, MODEL_ID);
    const full = resolve(root, decoded.slice(prefix.length));
    return full.startsWith(root + sep) ? full : undefined;
  }
  return undefined;
}

type Next = (err?: unknown) => void;

function createMiddleware(serveModels: boolean) {
  return (req: IncomingMessage, res: ServerResponse, next: Next): void =>
    serve(req, res, next, serveModels);
}

function serve(req: IncomingMessage, res: ServerResponse, next: Next, serveModels: boolean): void {
  const pathname = new URL(req.url ?? "/", "http://local").pathname;
  if (!pathname.startsWith("/ort/") && !(serveModels && pathname.startsWith("/models/"))) {
    return next();
  }
  const bundled = bundledDir();
  if (bundled && pathname === `${BUNDLED_PREFIX}bundle.json`) {
    const body = JSON.stringify(manifestFor(verifyModelDir(bundled)));
    res.setHeader("Content-Type", "application/json");
    res.end(body);
    return;
  }
  const file = resolveAsset(pathname);
  if (!file || !existsSync(file) || !statSync(file).isFile()) {
    res.statusCode = 404;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end("Introuvable");
    return;
  }
  const ext = file.slice(file.lastIndexOf("."));
  res.setHeader("Content-Type", MIME[ext] ?? "application/octet-stream");
  res.setHeader("Content-Length", String(statSync(file).size));
  createReadStream(file).pipe(res);
}

export function localAssets(): Plugin {
  let outDir = "";
  return {
    name: "lessive-local-assets",
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    configureServer(server) {
      server.middlewares.use(createMiddleware(true));
    },
    configurePreviewServer(server) {
      server.middlewares.use(createMiddleware(false));
    },
    generateBundle(_options, bundle) {
      // Le code d'ORT référence son .wasm par `new URL(…, import.meta.url)` : Vite en émet une copie
      // de 27 Mo dans assets/, jamais demandée (wasmPaths pointe vers /ort/). On ne la livre pas.
      for (const key of Object.keys(bundle)) {
        if (/ort-wasm-simd-threaded.*\.wasm$/.test(key)) delete bundle[key];
      }
    },
    closeBundle() {
      for (const name of ORT_FILES) {
        cpSync(join(ORT_DIR, name), join(outDir, "ort", name));
      }
      const bundled = bundledDir();
      if (bundled) writeBundle(outDir, bundled);
    },
  };
}
