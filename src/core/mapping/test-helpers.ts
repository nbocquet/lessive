import type { Detection, EntityType, Session, TransformPlan } from "../types/index.ts";
import { transform } from "../transform/transform.ts";

const plan: TransformPlan = { mode: "pseudonymization", defaultOperator: "pseudonymize" };

/** Transforme un texte dont les valeurs [valeur, type] sont citées dans l'ordre. */
export function run(session: Session, text: string, items: [string, EntityType][]): string {
  let from = 0;
  const detections: Detection[] = items.map(([value, entityType], i) => {
    const start = text.indexOf(value, from);
    if (start < 0) throw new Error("valeur introuvable");
    from = start + value.length;
    return {
      id: `d${i}`,
      start,
      end: from,
      entityType,
      score: 1,
      recognizerId: "test",
      packId: "test",
      source: "manual",
      explanation: [],
    };
  });
  return transform(text, detections, plan, session).text;
}
