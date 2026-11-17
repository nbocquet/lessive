import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { localAssets } from "./scripts/vite-plugin-local-assets.ts";
import { serviceWorkerManifest } from "./scripts/vite-plugin-service-worker.ts";

export default defineConfig({
  root: "src/web",
  publicDir: "public",
  base: "./",
  // `root` est src/web : sans chemin explicite, svelte.config.js (mode runes forcé, R12) ne serait pas trouvé.
  plugins: [
    svelte({ configFile: fileURLToPath(new URL("./svelte.config.js", import.meta.url)) }),
    // Sert /ort/ et /models/ en développement et les copie dans dist/ au build (R1, R4).
    localAssets(),
    // Injecte dans dist/sw.js la liste des fichiers à mettre en cache pour le hors-ligne (T6.2).
    serviceWorkerManifest(),
  ],
  build: {
    outDir: "../../dist",
    emptyOutDir: true,
    // Le polyfill de préchargement contient un appel réseau : inutile ici (un seul point d'entrée, pas de préchargement).
    modulePreload: { polyfill: false },
  },
  worker: {
    format: "es",
  },
});
