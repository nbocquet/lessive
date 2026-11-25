/** Garde-fous de conventions sur les sources de src/web (R5, R6, R12), tests exclus. */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = new URL(".", import.meta.url).pathname;

function sources(dir = ROOT): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name);
    if (e.isDirectory()) return sources(path);
    return /\.(ts|svelte|html|css)$/.test(e.name) && !/\.test\.ts$/.test(e.name) ? [path] : [];
  });
}

function offenders(pattern: RegExp, files = sources()): string[] {
  return files
    .filter((f) => pattern.test(readFileSync(f, "utf8")))
    .map((f) => f.slice(ROOT.length));
}

describe("conventions de src/web", () => {
  it("trouve des fichiers à contrôler", () => {
    expect(sources().length).toBeGreaterThan(10);
  });

  it("R5 : aucun console.log ; stockage navigateur réservé aux préférences (ADR 0005)", () => {
    expect(offenders(/console\.log/)).toEqual([]);
    expect(offenders(/\b(sessionStorage|indexedDB)\b/)).toEqual([]);
    expect(offenders(/\blocalStorage\b/)).toEqual(["preferences.ts"]);
  });

  it("R6 : jamais « anonymisé » ou dérivés dans l'interface", () => {
    expect(offenders(/anonymis/i)).toEqual([]);
  });

  it("R6 : l'avertissement permanent est présent dans App", () => {
    const banner = readFileSync(join(ROOT, "components/LimitsBanner.svelte"), "utf8");
    expect(banner).toContain(
      "Lessive réduit le risque mais ne garantit pas l'anonymat : relisez le résultat.",
    );
    expect(readFileSync(join(ROOT, "App.svelte"), "utf8")).toContain("<LimitsBanner />");
  });

  it("R12 : syntaxe des runes uniquement", () => {
    const svelte = sources().filter((f) => f.endsWith(".svelte") || f.endsWith(".svelte.ts"));
    expect(offenders(/^\s*export let\b/m, svelte)).toEqual([]);
    expect(offenders(/^\s*\$:/m, svelte)).toEqual([]);
    expect(offenders(/svelte\/store|@sveltejs\/kit/, sources())).toEqual([]);
  });

  it("R1 : aucune API réseau dans le code de l'interface", () => {
    // `dev-model.ts` (raccourci de développement, même origine) est exclu : il n'entre pas dans le build
    // de production, ce que vérifie le test suivant. `bundled-model.ts` (modèle fourni, ADR 0004) est
    // exclu : il ne lit que des URL relatives à la racine de l'application, ce que vérifie un autre test.
    const files = sources().filter(
      (f) => !f.endsWith("/dev-model.ts") && !f.endsWith("/bundled-model.ts"),
    );
    expect(offenders(/\b(fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon)\b/, files)).toEqual(
      [],
    );
  });

  it("R1 : dev-model.ts n'est importé que dynamiquement, derrière import.meta.env.DEV", () => {
    const importers = sources().filter((f) =>
      /from "\.\/dev-model\.ts"/.test(readFileSync(f, "utf8")),
    );
    expect(importers.map((f) => f.slice(ROOT.length))).toEqual([]);
    expect(offenders(/import\("\.\/dev-model\.ts"\)/).sort()).toEqual([
      "ner-provider.ts",
      "state.svelte.ts",
    ]);
  });

  it("R1 : bundled-model.ts ne lit que des URL relatives à la racine de l'application", () => {
    const src = readFileSync(join(ROOT, "bundled-model.ts"), "utf8");
    const calls = [...src.matchAll(/fetch\(([^)]*)\)/g)].map((m) => m[1]);
    expect(calls.length).toBeGreaterThan(0);
    for (const arg of calls) expect(arg).toMatch(/^new URL\(`\$\{BUNDLED_DIR\}[^`]*`, appRoot$/);
    expect(src).not.toMatch(/https?:\/\//);
  });

  it("R1 : la CSP interdit toute origine externe", () => {
    const html = readFileSync(join(ROOT, "index.html"), "utf8");
    const csp = /Content-Security-Policy"\s+content="([^"]+)"/.exec(html)?.[1] ?? "";
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("connect-src 'self'");
    expect(csp).toContain("worker-src 'self'");
    expect(csp).not.toMatch(/https?:|\*/);
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-(inline|eval)'/);
  });
});
