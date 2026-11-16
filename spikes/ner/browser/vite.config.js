// Serveur de développement du spike NER (mesure navigateur à la main).
// - /models/*  -> ../../../models   (modèles déposés à la main, jamais téléchargés)
// - /ort/*     -> node_modules/onnxruntime-web/dist (fichiers WASM : sinon Transformers.js
//                 les irait chercher sur un CDN, ce qui violerait R1)
// - /corpus/*  -> ../../../corpus
// - /api/models -> liste des modèles présents
import { createReadStream, existsSync, readdirSync, statSync } from "node:fs";
import { dirname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const here = dirname(fileURLToPath(import.meta.url));
const spikeRoot = resolve(here, "..");
const repoRoot = resolve(here, "..", "..", "..");
const MOUNTS = {
  "/models/": join(repoRoot, "models"),
  "/ort/": join(spikeRoot, "node_modules", "onnxruntime-web", "dist"),
  "/corpus/": join(repoRoot, "corpus"),
};
const MIME = {
  ".wasm": "application/wasm",
  ".mjs": "text/javascript",
  ".js": "text/javascript",
  ".json": "application/json",
  ".jsonl": "text/plain; charset=utf-8",
  ".onnx": "application/octet-stream",
  ".md": "text/plain; charset=utf-8",
};

function listModels() {
  const base = MOUNTS["/models/"];
  if (!existsSync(base)) return [];
  const out = [];
  const check = (id, dir) => {
    const onnx = join(dir, "onnx");
    if (existsSync(join(dir, "config.json")) && existsSync(onnx)) {
      const files = readdirSync(onnx).filter((f) => f.endsWith(".onnx"));
      if (files.length) out.push({ id, files });
    }
  };
  for (const org of readdirSync(base, { withFileTypes: true })) {
    if (!org.isDirectory()) continue;
    for (const name of readdirSync(join(base, org.name), { withFileTypes: true })) {
      if (name.isDirectory()) check(`${org.name}/${name.name}`, join(base, org.name, name.name));
    }
  }
  return out;
}

function localAssets() {
  return {
    name: "lessive-local-assets",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = decodeURIComponent((req.url ?? "").split("?")[0]);
        if (url === "/api/models") {
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(listModels()));
          return;
        }
        for (const [prefix, dir] of Object.entries(MOUNTS)) {
          if (!url.startsWith(prefix)) continue;
          const file = normalize(join(dir, url.slice(prefix.length)));
          if (!file.startsWith(dir + sep) || !existsSync(file) || !statSync(file).isFile()) {
            res.statusCode = 404;
            res.end("introuvable");
            return;
          }
          const ext = file.slice(file.lastIndexOf("."));
          res.setHeader("Content-Type", MIME[ext] ?? "application/octet-stream");
          res.setHeader("Content-Length", statSync(file).size);
          createReadStream(file).pipe(res);
          return;
        }
        next();
      });
    },
  };
}

const headers = {
  // Isolation inter-origines : nécessaire pour le WASM multi-thread (SharedArrayBuffer).
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
};
// CSP du projet (R1), activable avec CSP=1 npm run browser. Non testée en navigateur par l'agent.
if (process.env.CSP === "1") {
  headers["Content-Security-Policy"] =
    "default-src 'self'; connect-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; style-src 'self' 'unsafe-inline'";
}

export default defineConfig({
  root: here,
  plugins: [localAssets()],
  server: { headers, host: "127.0.0.1" },
  worker: { format: "es" },
  build: { outDir: resolve(here, "dist"), emptyOutDir: true, target: "es2022" },
});
