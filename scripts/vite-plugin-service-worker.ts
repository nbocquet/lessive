/**
 * Plugin Vite local, sans dépendance (T6.2) : injecte dans `dist/sw.js` le manifeste des fichiers
 * à mettre en cache pour le fonctionnement hors ligne.
 *
 * - Le service worker lui-même (`src/web/public/sw.js`, copié tel quel par Vite) est écrit à la main.
 * - Le manifeste liste les fichiers statiques de l'application : `index.html` et `assets/` (groupe
 *   « app », mis en cache à l'installation), `ort/` (groupe « data », mis en cache en arrière-plan).
 * - Le dossier `models/` n'en fait jamais partie : le modèle NER est chargé par l'utilisateur et
 *   conservé par l'application dans son propre cache (`lessive-models-v1`).
 * - Les versions sont des condensats du contenu : le service worker change d'octets, donc est
 *   réinstallé, à chaque modification de l'application.
 */
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import type { Plugin } from "vite";

export interface ManifestEntry {
  url: string;
  group: "app" | "data";
  size: number;
  hash: string;
}

export interface OfflineManifest {
  version: string;
  dataVersion: string;
  entries: ManifestEntry[];
}

const TOKEN = '"__LESSIVE_MANIFEST__"';

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = join(dir, e.name);
    return e.isDirectory() ? walk(full) : [full];
  });
}

const digest = (parts: string[]) => createHash("sha256").update(parts.join("\n")).digest("hex");

/** Fichiers de `dist` à mettre en cache (chemins relatifs en `/`), triés. Exporté pour les tests e2e. */
export function offlineFiles(outDir: string): string[] {
  return walk(outDir)
    .map((f) => relative(outDir, f).split(sep).join("/"))
    .filter((f) => f !== "sw.js" && !f.startsWith("models/"))
    .sort();
}

export function buildManifest(outDir: string): OfflineManifest {
  const entries: ManifestEntry[] = offlineFiles(outDir).map((url) => {
    const path = join(outDir, url);
    return {
      url,
      group: url.startsWith("ort/") ? "data" : "app",
      size: statSync(path).size,
      hash: createHash("sha256").update(readFileSync(path)).digest("hex").slice(0, 16),
    };
  });
  const sign = (group: string) =>
    digest(entries.filter((e) => e.group === group).map((e) => `${e.url}:${e.hash}`)).slice(0, 16);
  return { version: sign("app"), dataVersion: sign("data"), entries };
}

export function serviceWorkerManifest(): Plugin {
  let outDir = "";
  return {
    name: "lessive-service-worker-manifest",
    apply: "build",
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    closeBundle: {
      // Après la copie de public/, de ort/ et du reste : le manifeste doit voir le dossier final.
      order: "post",
      handler() {
        const file = join(outDir, "sw.js");
        const source = readFileSync(file, "utf8");
        if (!source.includes(TOKEN)) {
          this.error("sw.js : marqueur de manifeste introuvable.");
        }
        const manifest = buildManifest(outDir);
        writeFileSync(
          file,
          source.replace(TOKEN, () => JSON.stringify(manifest)),
        );
      },
    },
  };
}
