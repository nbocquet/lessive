import { readdirSync, existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PackLoadError, buildRegistry, bundledSources, loadBundledRegistry } from "./packs.ts";

const PACKS_DIR = new URL("../../packs/", import.meta.url);

describe("packs livrés", () => {
  it("charge tous les dossiers de packs/ (hors outils) dans le registre", () => {
    const dirs = readdirSync(PACKS_DIR, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith("_"))
      .filter((e) => existsSync(new URL(`${e.name}/manifest.json`, PACKS_DIR)))
      .map((e) => e.name)
      .sort();
    expect(dirs.length).toBeGreaterThan(0);

    expect(bundledSources().map((s) => s.dir)).toEqual(dirs);
    const registry = loadBundledRegistry();
    expect(registry.list().map((p) => p.manifest.id)).toEqual(dirs);
    expect(registry.checkDependencies()).toEqual([]);
    expect(registry.activeRules().length).toBeGreaterThan(0);
  });

  it("fournit les fichiers de règles de chaque manifeste", () => {
    for (const s of bundledSources()) {
      const listed = (s.manifest as { rules: string[] }).rules;
      for (const file of listed) expect(Object.keys(s.files)).toContain(file);
    }
  });

  it("renvoie le même registre à chaque appel", () => {
    expect(loadBundledRegistry()).toBe(loadBundledRegistry());
  });
});

describe("buildRegistry", () => {
  const manifest = {
    id: "mini",
    version: "1.0.0",
    engineVersion: "0.1.0",
    type: "domain",
    name: "Mini",
    rules: ["rules/a.json"],
  };
  const rules = {
    rules: [{ kind: "dictionary", id: "r", entityType: "PERSON", score: 0.5, terms: ["x"] }],
  };

  it("accepte un pack valide", () => {
    const reg = buildRegistry([{ dir: "mini", manifest, files: { "rules/a.json": rules } }]);
    expect(reg.has("mini")).toBe(true);
  });

  it("lève une erreur claire nommant le pack et le fichier invalides", () => {
    const bad = {
      rules: [{ kind: "pattern", id: "p", entityType: "EMAIL", score: 2, pattern: "(" }],
    };
    try {
      buildRegistry([{ dir: "mini", manifest, files: { "rules/a.json": bad } }]);
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(PackLoadError);
      const message = (err as PackLoadError).message;
      expect(message).toContain("packs/mini");
      expect(message).toContain("mini");
      expect(message).toContain("rules/a.json");
    }
  });

  it("signale un fichier de règles manquant, un identifiant en double et une dépendance absente", () => {
    expect(() => buildRegistry([{ dir: "mini", manifest, files: {} }])).toThrow(PackLoadError);
    const ok = { dir: "mini", manifest, files: { "rules/a.json": rules } };
    expect(() => buildRegistry([ok, ok])).toThrow(/déjà enregistré/);
    const dep = { ...manifest, dependencies: ["absent"] };
    expect(() =>
      buildRegistry([{ dir: "mini", manifest: dep, files: { "rules/a.json": rules } }]),
    ).toThrow(/absent/);
  });
});
