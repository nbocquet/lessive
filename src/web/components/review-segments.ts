/**
 * Découpage du texte original en segments (T5.2) : logique pure, sans DOM.
 *
 * Positions (R7) : indices UTF-16 sur le texte original, `end` exclu. Un segment
 * ne contient pas de texte, seulement ses bornes : le composant relit le texte
 * avec `text.slice(start, end)` et le rend en nœud de texte (jamais en HTML).
 */

export interface SpanLike {
  id: string;
  start: number;
  end: number;
}

/** Morceau contigu du texte ; `detectionId` vaut `null` pour du texte non détecté. */
export interface Segment {
  start: number;
  end: number;
  detectionId: string | null;
}

/**
 * Découpe `[0, textLength[` en segments contigus qui couvrent tout le texte.
 *
 * Les détections sont triées par position. Par prudence, une détection hors du
 * texte, vide ou chevauchant la précédente est ignorée (le moteur garantit l'absence
 * de chevauchement ; l'interface ne doit pourtant jamais planter ni dupliquer du texte).
 */
export function buildSegments(textLength: number, detections: readonly SpanLike[]): Segment[] {
  const sorted = [...detections].sort((a, b) => a.start - b.start || b.end - a.end);
  const segments: Segment[] = [];
  let cursor = 0;
  for (const d of sorted) {
    const valid =
      Number.isInteger(d.start) &&
      Number.isInteger(d.end) &&
      d.start < d.end &&
      d.end <= textLength;
    if (!valid || d.start < cursor) continue;
    if (d.start > cursor) segments.push({ start: cursor, end: d.start, detectionId: null });
    segments.push({ start: d.start, end: d.end, detectionId: d.id });
    cursor = d.end;
  }
  if (cursor < textLength) segments.push({ start: cursor, end: textLength, detectionId: null });
  return segments;
}
