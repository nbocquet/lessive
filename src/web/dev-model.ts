/**
 * Raccourci de développement : le modèle de `models/` (racine du dépôt) servi par Vite à `/models/`.
 *
 * DÉVELOPPEMENT SEULEMENT. Ce module n'est importé que derrière `import.meta.env.DEV` (import
 * dynamique) : il n'entre pas dans le build de production, qui ne livre aucun modèle (ADR 0003). C'est
 * pourquoi il est le seul fichier de `src/web` autorisé à employer `fetch` (voir `conventions.test.ts`) :
 * requête vers l'origine de la page, jamais vers l'extérieur.
 */
import type { LocalModelFileSource } from "../ner/local-files.ts";
import type { ModelInfo } from "./model-store.ts";

export const DEV_MODEL_ID = "Xenova/distilbert-base-multilingual-cased-ner-hrl";

/** Lit `<racine>/models/<DEV_MODEL_ID>/<fichier>` ; une réponse HTML (repli de page) vaut « absent ». */
export function devFileSource(appRoot: string | URL): LocalModelFileSource {
  return async (name) => {
    const res = await fetch(new URL(`models/${DEV_MODEL_ID}/${name}`, appRoot));
    const type = res.headers.get("content-type") ?? "";
    return res.ok && !type.startsWith("text/html") ? res : undefined;
  };
}

/** Le serveur de développement sert-il le modèle ? */
export async function probeDevModel(appRoot: string | URL): Promise<boolean> {
  try {
    const res = await fetch(new URL(`models/${DEV_MODEL_ID}/config.json`, appRoot));
    const type = res.headers.get("content-type") ?? "";
    return res.ok && type.startsWith("application/json");
  } catch {
    return false;
  }
}

/** Fiche du modèle de développement (non vérifiée : le serveur de développement ne le liste pas). */
export function devModelInfo(): ModelInfo {
  return {
    name: DEV_MODEL_ID,
    sizeBytes: 0,
    labels: [],
    dtype: "q8",
    warnings: ["Modèle de développement servi par Vite : absent d'une version publiée."],
    origin: "dev",
  };
}
