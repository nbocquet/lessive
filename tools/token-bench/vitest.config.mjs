import { defineConfig } from "vitest/config";

// Config locale du spike S2 : `npx vitest run --root tools/token-bench`
export default defineConfig({
  test: { include: ["**/*.test.mjs"], environment: "node" },
});
