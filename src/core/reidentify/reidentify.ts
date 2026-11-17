import type { Entity, Session } from "../types/index.ts";
import { findTokens } from "./tokens.ts";

/** Forme d'origine à restituer : la plus longue (par défaut), la première enregistrée, ou un choix libre. */
export type SurfaceFormChoice = "longest" | "first" | ((entity: Entity) => string);

export interface ReidentifyOptions {
  form?: SurfaceFormChoice;
}

/**
 * Jeton remplacé. Aucune valeur d'origine (R5) : l'interface la relira dans la
 * session au besoin, par `entityId`.
 */
export interface Replacement {
  /** Zone remplacée dans le texte reçu (UTF-16). */
  start: number;
  end: number;
  /** Zone correspondante dans le texte réidentifié (UTF-16). */
  outputStart: number;
  outputEnd: number;
  pseudonym: string;
  entityId: string;
}

/** Jeton laissé tel quel (inconnu ou ambigu), position dans le texte reçu. */
export interface LeftToken {
  start: number;
  end: number;
  pseudonym: string;
}

export interface ReidentifyResult {
  text: string;
  replacements: Replacement[];
  unknown: LeftToken[];
  ambiguous: LeftToken[];
}

function pickForm(entity: Entity, choice: SurfaceFormChoice): string | undefined {
  if (typeof choice === "function") return choice(entity);
  const forms = entity.surfaceForms;
  if (choice === "first") return forms[0];
  let best: string | undefined;
  for (const f of forms) if (best === undefined || f.length > best.length) best = f;
  return best;
}

/**
 * Remet les valeurs d'origine dans la réponse d'un LLM. Fonction explicite :
 * jamais appelée automatiquement. Les jetons inconnus et ambigus sont laissés
 * tels quels et listés ; un possessif ou pluriel accolé reste en place.
 */
export function reidentify(
  text: string,
  session: Session,
  options: ReidentifyOptions = {},
): ReidentifyResult {
  const choice = options.form ?? "longest";
  const replacements: Replacement[] = [];
  const unknown: LeftToken[] = [];
  const ambiguous: LeftToken[] = [];
  let out = "";
  let cursor = 0;

  for (const m of findTokens(text, session)) {
    const left = { start: m.start, end: m.end, pseudonym: m.canonical };
    const entity = m.status === "known" ? session.byPseudonym(m.canonical) : undefined;
    const value = entity ? pickForm(entity, choice) : undefined;
    if (!entity || !value) {
      // Ambigu, inconnu, ou entité sans forme exploitable : laissé tel quel.
      (m.status === "ambiguous" ? ambiguous : unknown).push(left);
      continue;
    }
    out += text.slice(cursor, m.start);
    const outputStart = out.length;
    out += value;
    replacements.push({
      ...left,
      outputStart,
      outputEnd: out.length,
      entityId: entity.id,
    });
    cursor = m.end;
  }
  out += text.slice(cursor);
  return { text: out, replacements, unknown, ambiguous };
}
