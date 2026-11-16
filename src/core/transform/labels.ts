import type { EntityType } from "../types/index.ts";

/**
 * Libellés français par type d'entité, source unique pour l'opérateur
 * `categorize` (`[PERSONNE]`) et pour les préfixes de pseudonymes
 * (`PERSONNE_001`, voir `mapping/pseudonym.ts`).
 *
 * `Record<EntityType, string>` : le compilateur refuse l'ajout d'un type
 * d'entité sans libellé.
 */
export const ENTITY_LABELS: Readonly<Record<EntityType, string>> = {
  PERSON: "PERSONNE",
  ORGANIZATION: "ORGANISATION",
  LOCATION: "LIEU",
  EMAIL: "EMAIL",
  PHONE: "TELEPHONE",
  URL: "URL",
  IP_ADDRESS: "IP",
  IBAN: "IBAN",
  CREDIT_CARD: "CARTE",
  SECRET: "SECRET",
  DATE: "DATE",
  CH_AVS: "AVS",
  CH_UID: "IDE",
  FR_NIR: "NIR",
  FR_SIREN: "SIREN",
  FR_SIRET: "SIRET",
};

/** Libellé de catégorie entre crochets, par exemple `[PERSONNE]`. */
export function categoryLabel(entityType: EntityType): string {
  return `[${ENTITY_LABELS[entityType]}]`;
}
