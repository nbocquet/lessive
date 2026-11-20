/** Lecture des packs distribués, indépendante du répertoire de travail. */
import { readdir, readFile } from "node:fs/promises";
import { ENGINE_VERSION } from "../core/index.ts";
import {
  PackManifestSchema,
  PackRegistry,
  parsePack,
  type ActiveRule,
} from "../core/registry/index.ts";

export async function loadRules(maskDates: boolean): Promise<ActiveRule[]> {
  const root = new URL("../../packs/", import.meta.url);
  const registry = new PackRegistry();
  const entries = await readdir(root, { withFileTypes: true });
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory() || entry.name.startsWith("_")) continue;
    const directory = new URL(`${entry.name}/`, root);
    const raw: unknown = JSON.parse(await readFile(new URL("manifest.json", directory), "utf8"));
    const manifest = PackManifestSchema.parse(raw);
    const files: Record<string, unknown> = {};
    for (const file of manifest.rules) {
      files[file] = JSON.parse(await readFile(new URL(file, directory), "utf8"));
    }
    const parsed = parsePack(raw, files, ENGINE_VERSION);
    if (!parsed.ok) throw new Error("Packs distribués invalides.");
    registry.register(parsed.pack);
  }
  registry.setPackEnabled("dates", maskDates);
  return registry.activeRules();
}
