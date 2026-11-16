import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "packs/**/*.test.ts"],
    environment: "node",
  },
});
