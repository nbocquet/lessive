/**
 * Préparation de l'aperçu de réidentification (T5.6). Logique pure, sans DOM.
 *
 * Le texte réidentifié contient de nouveau des données personnelles : il ne sert
 * qu'à l'affichage (nœuds de texte) et à la copie, jamais à un journal (R5). Les
 * listes de jetons laissés tels quels ne portent que des pseudonymes.
 */
import type { ReidentifyResult } from "../../core/index.ts";

export interface PreviewSegment {
  text: string;
  /** Pseudonyme remplacé ; absent pour le texte inchangé. */
  pseudonym?: string;
}

export interface LeftTokenGroup {
  pseudonym: string;
  occurrences: number;
}

export interface ReidPreview {
  segments: PreviewSegment[];
  /** Nombre de jetons remplacés (occurrences). */
  replacedCount: number;
  /** Nombre d'entités distinctes remises. */
  entityCount: number;
  unknown: LeftTokenGroup[];
  ambiguous: LeftTokenGroup[];
  unknownCount: number;
  ambiguousCount: number;
}

function group(tokens: readonly { pseudonym: string }[]): LeftTokenGroup[] {
  const counts = new Map<string, number>();
  for (const t of tokens) counts.set(t.pseudonym, (counts.get(t.pseudonym) ?? 0) + 1);
  return [...counts].map(([pseudonym, occurrences]) => ({ pseudonym, occurrences }));
}

/** Découpe le texte réidentifié en segments, les noms remis étant marqués. */
export function prepareReidentifyPreview(result: ReidentifyResult): ReidPreview {
  const segments: PreviewSegment[] = [];
  let cursor = 0;
  const ordered = [...result.replacements].sort((a, b) => a.outputStart - b.outputStart);
  for (const r of ordered) {
    if (r.outputStart < cursor || r.outputEnd > result.text.length) continue; // défensif
    if (r.outputStart > cursor) segments.push({ text: result.text.slice(cursor, r.outputStart) });
    segments.push({ text: result.text.slice(r.outputStart, r.outputEnd), pseudonym: r.pseudonym });
    cursor = r.outputEnd;
  }
  if (cursor < result.text.length) segments.push({ text: result.text.slice(cursor) });
  return {
    segments,
    replacedCount: result.replacements.length,
    entityCount: new Set(result.replacements.map((r) => r.entityId)).size,
    unknown: group(result.unknown),
    ambiguous: group(result.ambiguous),
    unknownCount: result.unknown.length,
    ambiguousCount: result.ambiguous.length,
  };
}

/** Libellé de compteur au singulier ou au pluriel. */
export function countLabel(n: number, one: string, many: string): string {
  return n === 1 ? `1 ${one}` : `${n} ${many}`;
}
