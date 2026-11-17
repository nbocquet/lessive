/** Libellés et repères visuels de l'écran de vérification (T5.2, T5.3). */
import {
  ENTITY_LABELS,
  ENTITY_TYPES,
  type DetectionSource,
  type EntityType,
  type Mode,
  type OperatorId,
} from "../../core/index.ts";

export const TYPE_NAMES: Readonly<Record<EntityType, string>> = {
  PERSON: "Personne",
  ORGANIZATION: "Organisation",
  LOCATION: "Lieu",
  EMAIL: "Adresse e-mail",
  PHONE: "Téléphone",
  URL: "Adresse web",
  IP_ADDRESS: "Adresse IP",
  IBAN: "IBAN",
  CREDIT_CARD: "Carte bancaire",
  SECRET: "Secret (clé, mot de passe)",
  DATE: "Date",
  CH_AVS: "N° AVS (Suisse)",
  CH_UID: "N° IDE (Suisse)",
  FR_NIR: "N° de sécurité sociale (France)",
  FR_SIREN: "SIREN (France)",
  FR_SIRET: "SIRET (France)",
};

export function typeName(type: EntityType): string {
  return TYPE_NAMES[type];
}

/** Nom lisible suivi du libellé de remplacement, par exemple « Personne [PERSONNE] ». */
export function typeNameWithTag(type: EntityType): string {
  return `${TYPE_NAMES[type]} [${ENTITY_LABELS[type]}]`;
}

export const SOURCE_NAMES: Readonly<Record<DetectionSource, string>> = {
  pattern: "Règle (motif)",
  dictionary: "Règle (dictionnaire)",
  ner: "Reconnaissance de noms (NER)",
  manual: "Ajout manuel",
};

export const OPERATOR_NAMES: Readonly<Record<OperatorId, string>> = {
  suppress: "Suppression (rien à la place)",
  mask: "Masque (***)",
  categorize: "Catégorie ([PERSONNE])",
  pseudonymize: "Pseudonyme (PERSONNE_001)",
};

/** Opérateurs proposés : « pseudonymize » n'existe qu'en mode Pseudonymisation. */
export function operatorsForMode(mode: Mode): OperatorId[] {
  return mode === "pseudonymization"
    ? ["pseudonymize", "categorize", "mask", "suppress"]
    : ["categorize", "mask", "suppress"];
}

const UNDERLINES = ["solid", "dashed", "dotted", "double", "wavy"] as const;

export interface TypeToken {
  /** Teinte HSL 0..359. */
  hue: number;
  /** Style de soulignement : la couleur ne porte jamais seule l'information. */
  underline: (typeof UNDERLINES)[number];
}

/** Couleur (angle d'or, teintes bien séparées) et soulignement propres à chaque type. */
export function typeToken(type: EntityType): TypeToken {
  const index = ENTITY_TYPES.indexOf(type);
  return {
    hue: Math.round((index * 137.508) % 360),
    underline: UNDERLINES[index % UNDERLINES.length] ?? "solid",
  };
}

/** Score affiché avec deux décimales à la française (0,90). */
export function formatScore(score: number): string {
  return score.toLocaleString("fr-CH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Extrait court d'une valeur pour une liste (pas de retour à la ligne, coupé proprement). */
export function excerpt(value: string, max = 40): string {
  const flat = value.replace(/\s+/gu, " ").trim();
  const chars = Array.from(flat);
  return chars.length > max ? `${chars.slice(0, max - 1).join("")}…` : flat;
}
