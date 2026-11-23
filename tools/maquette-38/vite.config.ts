import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { fileURLToPath } from "node:url";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  publicDir: false,
  plugins: [
    svelte({ configFile: fileURLToPath(new URL("../../svelte.config.js", import.meta.url)) }),
  ],
  server: { host: "127.0.0.1", port: 1338, strictPort: true },
  build: { outDir: "/tmp/lessive-maquette-38", emptyOutDir: true },
});
