import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import { svelte } from "@sveltejs/vite-plugin-svelte";

export default defineConfig({
  root: "src/web",
  publicDir: "public",
  base: "./",
  // `root` est src/web : sans chemin explicite, svelte.config.js (mode runes forcé, R12) ne serait pas trouvé.
  plugins: [svelte({ configFile: fileURLToPath(new URL("./svelte.config.js", import.meta.url)) })],
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
