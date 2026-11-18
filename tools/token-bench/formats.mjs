// S2 — Formats de jetons candidats (prototype jetable, hors build).
//
// Les types d'entités reprennent ceux des contrats du moteur (PLAN.md §5).
// Les préfixes français et les lettres du format C sont des propositions modifiables.

/** Type d'entité -> préfixe français (formats A et B) et lettre (format C). */
export const TYPE_INFO = Object.freeze({
  PERSON: { prefix: "PERSONNE", short: "P" },
  ORGANIZATION: { prefix: "ORGANISATION", short: "O" },
  LOCATION: { prefix: "LIEU", short: "L" },
  EMAIL: { prefix: "EMAIL", short: "E" },
  PHONE: { prefix: "TELEPHONE", short: "T" },
  IBAN: { prefix: "IBAN", short: "I" },
  CH_AVS: { prefix: "AVS", short: "A" },
});

export const ENTITY_TYPES = Object.freeze(Object.keys(TYPE_INFO));

const PREFIX_TO_TYPE = Object.fromEntries(
  Object.entries(TYPE_INFO).map(([type, info]) => [info.prefix, type]),
);
const SHORT_TO_TYPE = Object.fromEntries(
  Object.entries(TYPE_INFO).map(([type, info]) => [info.short, type]),
);

const pad3 = (n) => String(n).padStart(3, "0");

/**
 * Chaque format sait produire un jeton canonique (`render`), relire un jeton canonique
 * (`parse`) et donner la forme canonique des chiffres (`digits`).
 * `parse` renvoie `{ type, number }` ou `null`.
 */
export const FORMATS = Object.freeze({
  A: {
    id: "A",
    kind: "word",
    example: "PERSONNE_001",
    render: (type, n) => `${TYPE_INFO[type].prefix}_${pad3(n)}`,
    digits: (n) => pad3(n),
    parse(token) {
      const m = /^([A-Z]+)_(\d+)$/.exec(token);
      const type = m && PREFIX_TO_TYPE[m[1]];
      return type ? { type, number: Number(m[2]) } : null;
    },
  },
  B: {
    id: "B",
    kind: "word",
    example: "[PERSONNE_1]",
    render: (type, n) => `[${TYPE_INFO[type].prefix}_${n}]`,
    digits: (n) => String(n),
    parse(token) {
      const m = /^\[([A-Z]+)_(\d+)\]$/.exec(token);
      const type = m && PREFIX_TO_TYPE[m[1]];
      return type ? { type, number: Number(m[2]) } : null;
    },
  },
  C: {
    id: "C",
    kind: "short",
    example: "⟦P1⟧",
    render: (type, n) => `⟦${TYPE_INFO[type].short}${n}⟧`,
    digits: (n) => String(n),
    parse(token) {
      const m = /^⟦([A-Z])(\d+)⟧$/.exec(token);
      const type = m && SHORT_TO_TYPE[m[1]];
      return type ? { type, number: Number(m[2]) } : null;
    },
  },
});

export const FORMAT_IDS = Object.freeze(Object.keys(FORMATS));

export function getFormat(id) {
  const format = FORMATS[id];
  if (!format) throw new Error(`Format inconnu : ${id}`);
  return format;
}

export { SHORT_TO_TYPE, PREFIX_TO_TYPE };
