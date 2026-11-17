import { defineConfig } from "vitest/config";
import { svelte } from "@sveltejs/vite-plugin-svelte";

export default defineConfig({
  // Le plugin Svelte compile les modules `.svelte.ts` (runes) pour les tests de src/web.
  plugins: [svelte()],
  test: {
    include: ["src/**/*.test.ts", "packs/**/*.test.ts", "tests/regression/**/*.test.ts"],
    environment: "node",
  },
});
