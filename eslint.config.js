import js from "@eslint/js";
import tseslint from "typescript-eslint";
import svelte from "eslint-plugin-svelte";
import globals from "globals";

export default tseslint.config(
  { ignores: ["dist/", "node_modules/", "spikes/", "models/", "coverage/"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...svelte.configs.recommended,
  {
    languageOptions: { globals: { ...globals.browser } },
    rules: {
      "no-console": ["error", { allow: ["warn", "error"] }],
    },
  },
  {
    files: ["**/*.svelte", "**/*.svelte.ts"],
    languageOptions: { parserOptions: { parser: tseslint.parser } },
  },
  // Frontières : le moteur est indépendant de l'interface et du NER (R3).
  {
    files: ["src/core/**/*.ts"],
    languageOptions: { globals: {} },
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/ner/**", "**/web/**"],
              message: "src/core ne doit pas dépendre de src/ner ni de src/web (R3).",
            },
            {
              group: ["node:*"],
              message: "src/core doit rester indépendant de Node (R3).",
            },
          ],
          // Noms exacts : un motif « crypto » bloquerait aussi le dossier src/core/crypto.
          paths: ["fs", "path", "crypto", "os", "child_process", "worker_threads"].map((name) => ({
            name,
            message: "src/core doit rester indépendant de Node (R3).",
          })),
        },
      ],
    },
  },
  {
    files: ["src/ner/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [{ group: ["**/web/**"], message: "src/ner ne doit pas dépendre de src/web." }],
        },
      ],
    },
  },
  {
    files: ["**/*.test.ts", "*.config.{js,ts}", "packs/_tools/**/*.ts"],
    languageOptions: { globals: { ...globals.node } },
    rules: { "no-restricted-imports": "off", "no-console": "off" },
  },
);
