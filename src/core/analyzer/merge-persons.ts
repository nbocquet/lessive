/**
 * Fusion des noms de personne adjacents.
 *
 * Les dictionnaires reconnaissent séparément un prénom (« Claire ») et un nom de famille
 * (« Müller »). Deux détections PERSON séparées seulement par des espaces sur la même ligne
 * forment très probablement un seul nom : on ajoute une détection qui les couvre toutes, avec
 * un score rehaussé. Les détections d'origine restent ; la résolution des conflits garde la
 * plus large (elle les contient et son score est au moins égal).
 *
 * Cela évite deux pseudonymes pour une seule personne (« PERSONNE_001 PERSONNE_002 »), et
 * permet de retenir un prénom et un nom qui, seuls, resteraient sous le seuil.
 */
import type { AnalysisContext, Detection } from "../types/index.ts";

/** Bonus appliqué à une suite d'au moins deux noms adjacents. */
export const ADJACENT_PERSON_BOOST = 0.35;

const GAP = /^[ \u00A0\u202F]{1,2}$/;

export function mergeAdjacentPersons(
  text: string,
  detections: readonly Detection[],
  ctx: AnalysisContext,
): Detection[] {
  // Pour chaque position de départ, la détection PERSON la plus longue.
  const byStart = new Map<number, Detection>();
  for (const d of detections) {
    if (d.entityType !== "PERSON" || d.end <= d.start) continue;
    const cur = byStart.get(d.start);
    if (!cur || d.end > cur.end || (d.end === cur.end && d.score > cur.score)) {
      byStart.set(d.start, d);
    }
  }
  const spans = [...byStart.values()].sort((a, b) => a.start - b.start);

  const merged: Detection[] = [];
  let i = 0;
  while (i < spans.length) {
    const chain: Detection[] = [spans[i] as Detection];
    let j = i + 1;
    while (j < spans.length) {
      const last = chain[chain.length - 1] as Detection;
      const next = spans[j] as Detection;
      if (next.start < last.end) {
        j++; // chevauchement : laissé à la résolution des conflits
        continue;
      }
      if (!GAP.test(text.slice(last.end, next.start))) break;
      chain.push(next);
      j++;
    }
    if (chain.length >= 2) {
      const first = chain[0] as Detection;
      const last = chain[chain.length - 1] as Detection;
      const best = Math.max(...chain.map((d) => d.score));
      merged.push({
        id: ctx.nextId(),
        start: first.start,
        end: last.end,
        entityType: "PERSON",
        score: Math.min(1, Math.round((best + ADJACENT_PERSON_BOOST) * 1e6) / 1e6),
        recognizerId: first.recognizerId,
        packId: first.packId,
        source: first.source,
        explanation: [
          `${chain.length} éléments de nom adjacents réunis (+${ADJACENT_PERSON_BOOST})`,
        ],
      });
    }
    i = Math.max(i + 1, j);
  }
  return merged;
}
