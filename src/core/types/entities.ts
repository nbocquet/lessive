/**
 * Types d'entités reconnus par le MVP (amendement A15).
 *
 * Les identifiants sont stables : ils apparaissent dans les packs et dans les
 * tables de correspondance exportées. Ne jamais renommer une valeur existante.
 */
export const ENTITY_TYPES = [
  "PERSON",
  "ORGANIZATION",
  "LOCATION",
  "EMAIL",
  "PHONE",
  "URL",
  "IP_ADDRESS",
  "IBAN",
  "CREDIT_CARD",
  "SECRET",
  "DATE",
  "CH_AVS",
  "CH_UID",
  "FR_NIR",
  "FR_SIREN",
  "FR_SIRET",
] as const;

export type EntityType = (typeof ENTITY_TYPES)[number];

export function isEntityType(value: string): value is EntityType {
  return (ENTITY_TYPES as readonly string[]).includes(value);
}

/**
 * Priorité d'un type en cas d'égalité parfaite entre deux détections (étape 5
 * de la résolution des conflits). Plus le nombre est grand, plus le type gagne.
 * Les identifiants nationaux validés sont plus spécifiques qu'un nombre générique.
 */
export const ENTITY_PRIORITY: Readonly<Record<EntityType, number>> = {
  CH_AVS: 100,
  FR_NIR: 100,
  IBAN: 95,
  CREDIT_CARD: 95,
  FR_SIRET: 90,
  FR_SIREN: 85,
  CH_UID: 85,
  SECRET: 80,
  EMAIL: 75,
  URL: 70,
  IP_ADDRESS: 70,
  PHONE: 60,
  DATE: 50,
  PERSON: 40,
  ORGANIZATION: 35,
  LOCATION: 30,
};
