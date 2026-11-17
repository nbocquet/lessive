/** Importation d'un fichier texte local (T5.2) : contrôles purs ; la lecture se fait par FileReader. */
import { MAX_INPUT_LENGTH } from "../../core/index.ts";

export const IMPORT_EXTENSIONS = [".txt", ".md"] as const;

/** Un fichier UTF-8 de `MAX_INPUT_LENGTH` caractères pèse au plus 4 octets par caractère. */
export const MAX_IMPORT_BYTES = MAX_INPUT_LENGTH * 4;

/** Message d'erreur (sans contenu du fichier), ou `null` si le fichier peut être lu. */
export function checkImportFile(name: string, size: number): string | null {
  const lower = name.toLowerCase();
  if (!IMPORT_EXTENSIONS.some((ext) => lower.endsWith(ext))) {
    return "Format non pris en charge : choisissez un fichier .txt ou .md.";
  }
  if (size > MAX_IMPORT_BYTES) {
    return `Fichier trop volumineux : le texte est limité à ${MAX_INPUT_LENGTH.toLocaleString("fr-CH")} caractères.`;
  }
  return null;
}

/** Retire le BOM et uniformise les fins de ligne (le texte importé devient le texte original). */
export function normalizeImportedText(raw: string): string {
  return raw.replace(/^\uFEFF/u, "").replace(/\r\n?/gu, "\n");
}
