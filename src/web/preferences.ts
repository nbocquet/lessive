/**
 * Préférences mémorisées sur demande de l’utilisateur (ADR 0005). Seul module autorisé à toucher
 * au stockage du navigateur dans `src/web`, et pour une seule clé. Elle contient uniquement des
 * identifiants de catégories décochées : jamais de texte, de détection ni de correspondance (R5).
 */
import { ALL_CLEANING_CATEGORIES, type CleaningCategory } from "./cleaning-categories.ts";

export const PREFERENCES_KEY = "lessive-preferences-v1";

/** Accès minimal au stockage, injectable dans les tests. Chaque méthode peut lever. */
export interface PreferenceStore {
  read(): string | null;
  write(value: string): void;
  remove(): void;
}

/**
 * On mémorise les catégories laissées en clair, pas les cochées : une catégorie ajoutée dans une
 * version ultérieure sera cochée d’office.
 */
export function serializeExcludedCategories(selected: readonly CleaningCategory[]): string {
  const excluded = ALL_CLEANING_CATEGORIES.filter((c) => !selected.includes(c));
  return JSON.stringify({ v: 1, excludedCategories: excluded });
}

/**
 * Relit la préférence et renvoie les catégories à remplacer, ou `null` si la valeur est absente
 * ou invalide. Les identifiants inconnus (catégorie retirée) sont ignorés.
 */
export function parseSelectedCategories(raw: string | null): CleaningCategory[] | null {
  if (raw === null) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null) return null;
  const { v, excludedCategories } = value as { v?: unknown; excludedCategories?: unknown };
  if (v !== 1 || !Array.isArray(excludedCategories)) return null;
  if (!excludedCategories.every((c) => typeof c === "string")) return null;
  return ALL_CLEANING_CATEGORIES.filter((c) => !excludedCategories.includes(c));
}

/** Stockage du navigateur, ou `null` s’il est absent ou refusé (navigation privée stricte, etc.). */
export function browserPreferenceStore(): PreferenceStore | null {
  try {
    const storage = globalThis.localStorage;
    if (!storage) return null;
    return {
      read: () => storage.getItem(PREFERENCES_KEY),
      write: (value) => storage.setItem(PREFERENCES_KEY, value),
      remove: () => storage.removeItem(PREFERENCES_KEY),
    };
  } catch {
    return null;
  }
}
