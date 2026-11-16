import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

export default defineConfig({
  root: "src/web",
  publicDir: "public",
  base: "./",
  plugins: [svelte()],
  build: {
    outDir: "../../dist",
    emptyOutDir: true,
  },
  worker: {
    format: "es",
  },
});
