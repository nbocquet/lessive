import type { EntityType } from "../types/index.ts";
import { ENTITY_LABELS } from "../transform/labels.ts";

/**
 * Mots de type reconnus dans une réponse de LLM, en plus du libellé français
 * de `ENTITY_LABELS` : traductions anglaises (un LLM qui traduit le texte
 * traduit souvent le jeton) et variantes courantes. Partiel par construction ;
 * `Record<EntityType, …>` oblige à y penser à chaque nouveau type.
 */
const EXTRA_WORDS: Readonly<Record<EntityType, readonly string[]>> = {
  PERSON: ["PERSON"],
  ORGANIZATION: ["ORGANIZATION"],
  LOCATION: ["LOCATION", "PLACE"],
  EMAIL: ["E-MAIL", "COURRIEL"],
  PHONE: ["PHONE"],
  URL: [],
  IP_ADDRESS: [],
  IBAN: [],
  CREDIT_CARD: ["CARD"],
  SECRET: [],
  DATE: [],
  CH_AVS: ["AHV", "OASI"],
  CH_UID: ["UID"],
  FR_NIR: [],
  FR_SIREN: [],
  FR_SIRET: [],
};

/** Majuscules, sans accents ni tirets : clé de comparaison d'un mot de type. */
export function normalizeTypeWord(word: string): string {
  return word
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f-]/g, "");
}

const entries = (Object.keys(ENTITY_LABELS) as EntityType[]).flatMap((type) =>
  [ENTITY_LABELS[type], ...EXTRA_WORDS[type]].map((word) => ({ type, word })),
);

const WORD_TO_TYPE = new Map<string, EntityType>();
for (const { type, word } of entries) {
  const key = normalizeTypeWord(word);
  // Premier arrivé gagne : le libellé français précède les traductions.
  if (!WORD_TO_TYPE.has(key)) WORD_TO_TYPE.set(key, type);
}

/** Type d'entité désigné par un mot (français ou anglais), ou undefined. */
export function typeOfWord(word: string): EntityType | undefined {
  return WORD_TO_TYPE.get(normalizeTypeWord(word));
}

/** Alternation de regex (insensible à la casse et aux accents sur E), mots longs d'abord. */
export const WORD_ALTERNATION: string = [...new Set(entries.map((e) => e.word))]
  .sort((a, b) => b.length - a.length)
  .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/E/g, "[EÉ]"))
  .join("|");
