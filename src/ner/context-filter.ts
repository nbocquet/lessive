/**
 * Écarte quelques libellés courants mal étiquetés par le NER. Les valeurs ne quittent pas
 * cette fonction : les détections restent des positions sur le texte original (R5, R7).
 * Les règles et les corrections manuelles ne passent pas par ce filtre.
 */
import type { NerSpan } from "./postprocess.ts";

const BREAK = "\\n\\r\\f\\v\\u0085\\u2028\\u2029";
const SPACE = `[^\\S${BREAK}]`;
const LINE_START = new RegExp(`(?:^|[${BREAK}])${SPACE}*$`, "u");
const SALUTATION =
  /^(?:madame|monsieur|mesdames|messieurs)(?:\s*,\s*(?:madame|monsieur|mesdames|messieurs))*\s*,?$/iu;
const SALUTATION_END = new RegExp(`^${SPACE}*(?:[,;]|[${BREAK}]|$)`, "u");
const IDENTIFIER_LABEL = /^(?:AVS|NIR|IBAN|IDE)$/u;
const LABEL_END = new RegExp(`^${SPACE}*(?::|[0-9])`, "u");
const NUMBER_LABEL = new RegExp(`(?:numéro|numero|number|n[°ºo]\\.?|no\\.?)${SPACE}*$`, "iu");
const IDENTIFIER_VALUE = new RegExp(`^${SPACE}*:${SPACE}*(?:[0-9]|[A-Z]{2,3}[- ]?[0-9])`, "u");
const ENGINEERING_ROLE = /^ingénieure?(?:\s+systèmes)?$/iu;
const LINE_END = new RegExp(`^${SPACE}*(?:[${BREAK}]|$)`, "u");
const PREVIOUS_SALUTATION = new RegExp(`(?:madame|mesdames),${SPACE}*$`, "iu");
const NEXT_SALUTATION = new RegExp(
  `^${SPACE}*,${SPACE}*(?:monsieur|messieurs)(?=${SPACE}*(?:,|[${BREAK}]|$))`,
  "iu",
);
const ROLE_END = new RegExp(`^${SPACE}+systèmes${SPACE}*(?:[${BREAK}]|$)`, "iu");
const IT_SUPPORT = /^IT(?:\s+support)?$/u;
const SUPPORT_END = new RegExp(`^${SPACE}*(?:,|[${BREAK}]|$)`, "u");
const SUPPORT_WORD = new RegExp(`^${SPACE}+support(?=${SPACE}*(?:,|[${BREAK}]|$))`, "u");

/** Contexte borné : ne pas rescanner un long document pour chaque libellé. */
function surroundings(text: string, span: NerSpan): { before: string; after: string } {
  const from = Math.max(0, span.start - 120);
  const to = Math.min(text.length, span.end + 120);
  return {
    // Les sentinelles empêchent de confondre une coupure de fenêtre avec une frontière de ligne.
    before: (from === 0 ? "" : "x") + text.slice(from, span.start),
    after: text.slice(span.end, to) + (to === text.length ? "" : "x"),
  };
}

export function filterContextualFalsePositives(text: string, spans: readonly NerSpan[]): NerSpan[] {
  return spans.filter((span) => {
    const value = text.slice(span.start, span.end);
    if (span.entityType === "PERSON" && SALUTATION.test(value)) {
      const { before, after } = surroundings(text, span);
      const formula =
        LINE_START.test(before) ||
        PREVIOUS_SALUTATION.test(before) ||
        NEXT_SALUTATION.test(after) ||
        value.includes(",");
      return !(formula && SALUTATION_END.test(after));
    }
    if (IDENTIFIER_LABEL.test(value)) {
      const { before, after } = surroundings(text, span);
      const label =
        NUMBER_LABEL.test(before) || (LINE_START.test(before) && IDENTIFIER_VALUE.test(after));
      return !(label && LABEL_END.test(after));
    }
    if (span.entityType !== "ORGANIZATION") return true;
    if (ENGINEERING_ROLE.test(value)) {
      const { before, after } = surroundings(text, span);
      const roleEnd = /\s/u.test(value) ? LINE_END : ROLE_END;
      return !(LINE_START.test(before) && roleEnd.test(after));
    }
    if (IT_SUPPORT.test(value)) {
      const { before, after } = surroundings(text, span);
      const rest = value === "IT" ? after.replace(SUPPORT_WORD, "") : after;
      return !(
        LINE_START.test(before) &&
        (value !== "IT" || SUPPORT_WORD.test(after)) &&
        SUPPORT_END.test(rest)
      );
    }
    return true;
  });
}
