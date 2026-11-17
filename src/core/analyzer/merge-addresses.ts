/**
 * Fusion des morceaux d'une adresse postale.
 *
 * Les packs détectent séparément la rue (« 7 avenue du Léman »), le code postal et la localité
 * (« 74100 Annemasse ») et la case postale, avec des motifs courts : un motif unique « rue + code
 * postal + ville » serait coûteux à vérifier (ReDoS) et fragile. Quand deux de ces morceaux se
 * suivent, séparés seulement par une virgule ou un retour à la ligne, on ajoute une détection qui
 * couvre toute l'adresse ; la résolution des conflits garde la plus large. L'adresse reçoit ainsi
 * un seul pseudonyme (LIEU_001) au lieu de deux.
 *
 * Seuls les morceaux venant de règles d'adresse sont réunis (identifiant de règle contenant
 * « street », « postal », « postbox » ou « address ») : deux villes citées à la suite
 * (« Genève, Lausanne ») ne deviennent pas un seul lieu.
 */
import type { AnalysisContext, Detection } from "../types/index.ts";

/** Bonus appliqué à une adresse réunie (rue + code postal, par exemple). */
export const ADDRESS_MERGE_BOOST = 0.1;

/** Au plus trois morceaux : rue, complément, code postal et localité. */
const MAX_PARTS = 3;

const ADDRESS_RULE = /(?:street|postal|postbox|address)/u;
// Virgule ou point-virgule facultatif, espaces, au plus un retour à la ligne.
const GAP = /^[,;]?[ \t\u00A0\u202F]*(?:\r?\n[ \t\u00A0\u202F]*)?$/u;

export function isAddressPart(d: Detection): boolean {
  return d.entityType === "LOCATION" && ADDRESS_RULE.test(d.recognizerId);
}

export function mergeAddressParts(
  text: string,
  detections: readonly Detection[],
  ctx: AnalysisContext,
): Detection[] {
  // Pour chaque position de départ, le morceau d'adresse le plus long.
  const byStart = new Map<number, Detection>();
  for (const d of detections) {
    if (!isAddressPart(d) || d.end <= d.start) continue;
    const cur = byStart.get(d.start);
    if (!cur || d.end > cur.end) byStart.set(d.start, d);
  }
  const parts = [...byStart.values()].sort((a, b) => a.start - b.start);

  const merged: Detection[] = [];
  let i = 0;
  while (i < parts.length) {
    const chain: Detection[] = [parts[i] as Detection];
    let j = i + 1;
    while (j < parts.length && chain.length < MAX_PARTS) {
      const last = chain[chain.length - 1] as Detection;
      const next = parts[j] as Detection;
      if (next.start < last.end) {
        j++; // chevauchement : laissé à la résolution des conflits
        continue;
      }
      const gap = text.slice(last.end, next.start);
      if (gap.length === 0 || !GAP.test(gap)) break;
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
        entityType: "LOCATION",
        score: Math.min(1, Math.round((best + ADDRESS_MERGE_BOOST) * 1e6) / 1e6),
        recognizerId: "core/address-merge",
        packId: first.packId,
        source: first.source,
        explanation: [
          `${chain.length} morceaux d'adresse adjacents réunis (+${ADDRESS_MERGE_BOOST})`,
        ],
      });
    }
    i = Math.max(i + 1, j);
  }
  return merged;
}
