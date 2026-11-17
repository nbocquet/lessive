import { formatPseudonym } from "../mapping/pseudonym.ts";

/** Formats de jeton pour lesquels une consigne existe (ADR 0002 : A par défaut). */
export type PromptNoticeFormat = "A";

export interface PromptNotice {
  fr: string;
  en: string;
}

/**
 * Consigne à joindre au prompt pour que le LLM recopie les jetons à
 * l'identique (ADR 0002). Source unique : l'interface l'affiche, elle ne la
 * recopie pas. Les exemples viennent de `formatPseudonym`.
 */
export function buildPromptNotice(format: PromptNoticeFormat = "A"): PromptNotice {
  if (format !== "A") throw new Error(`Format de jeton sans consigne : ${String(format)}`);
  const person = formatPseudonym("PERSON", 1);
  const org = formatPseudonym("ORGANIZATION", 2);
  const place = formatPseudonym("LOCATION", 3);
  return {
    fr: `Les mots de la forme ${person} (par exemple ${org} ou ${place}) sont des pseudonymes : recopie-les à l'identique, sans les traduire, les modifier ni les expliquer.`,
    en: `Words of the form ${person} (for example ${org} or ${place}) are pseudonyms: copy them exactly as written, without translating, modifying or explaining them.`,
  };
}
