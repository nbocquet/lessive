/**
 * Chargement des packs depuis le disque, pour les tests et les outils Node uniquement.
 * L'application web chargera les packs livrés autrement (import statique au build).
 */
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { ENGINE_VERSION, parsePack, type Pack } from "../../src/core/index.ts";

export const PACKS_ROOT = new URL("..", import.meta.url).pathname;

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

/** Charge et valide un pack ; lève une erreur listant tous les problèmes. */
export function loadPackDir(dir: string): Pack {
  const manifest = readJson(join(dir, "manifest.json")) as { rules?: unknown };
  const files: Record<string, unknown> = {};
  if (Array.isArray(manifest.rules)) {
    for (const f of manifest.rules) {
      if (typeof f === "string" && existsSync(join(dir, f))) files[f] = readJson(join(dir, f));
    }
  }
  const res = parsePack(manifest, files, ENGINE_VERSION);
  if (!res.ok) throw new Error(`Pack invalide (${dir}) :\n${res.errors.join("\n")}`);
  return res.pack;
}

/** Dossiers de packs livrés (tout dossier de packs/ contenant un manifest.json, sauf _tools). */
export function bundledPackDirs(): string[] {
  return readdirSync(PACKS_ROOT)
    .filter((name) => !name.startsWith("_"))
    .map((name) => join(PACKS_ROOT, name))
    .filter((dir) => statSync(dir).isDirectory() && existsSync(join(dir, "manifest.json")))
    .sort();
}
