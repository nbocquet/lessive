import type { EntityType } from "../types/index.ts";
import { ENTITY_LABELS } from "../transform/labels.ts";

/**
 * SEUL endroit qui définit le format d'un pseudonyme (le format final sera
 * tranché par le prototype S2). Aujourd'hui : libellé français + `_` + numéro
 * sur au moins 3 chiffres, par exemple `PERSONNE_001`.
 */
export function formatPseudonym(entityType: EntityType, n: number): string {
  return `${ENTITY_LABELS[entityType]}_${String(n).padStart(3, "0")}`;
}
