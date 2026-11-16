// S2 — Chargement du corpus synthétique (Node uniquement : spike, hors src/core).

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { FORMAT_IDS } from "./formats.mjs";
import { pseudonymize } from "./pseudonymize.mjs";

export const ROOT = dirname(fileURLToPath(import.meta.url));
export const TEXTES_DIR = join(ROOT, "textes");

/** Charge tous les textes sources (`<id>.txt` + `<id>.entites.json`), triés par id. */
export function loadCorpus(dir = TEXTES_DIR) {
  const ids = readdirSync(dir)
    .filter((f) => f.endsWith(".entites.json"))
    .map((f) => f.replace(/\.entites\.json$/, ""))
    .sort();
  return ids.map((id) => {
    const meta = JSON.parse(readFileSync(join(dir, `${id}.entites.json`), "utf8"));
    const source = readFileSync(join(dir, `${id}.txt`), "utf8");
    return { id, title: meta.titre, source, entities: meta.entites };
  });
}

/** Pseudonymise chaque texte dans chaque format : Map("<id>|<format>" -> résultat). */
export function buildAll(corpus = loadCorpus()) {
  const out = new Map();
  for (const t of corpus) {
    for (const f of FORMAT_IDS) {
      out.set(`${t.id}|${f}`, pseudonymize(t.source, t.entities, f));
    }
  }
  return out;
}
