import { TransformError, type Session, type TransformResult } from "../core/index.ts";

/**
 * Choix locaux par occurrence (#12), sans ajouter la surface ambiguë à une personne de la session.
 * Le moteur a déjà validé les intervalles ; seuls les repères demandés changent, puis les positions
 * de sortie sont recalculées. Le format de session et les contrats du moteur restent inchangés.
 */
export function applyOccurrenceAssignments(
  result: TransformResult,
  assignments: Readonly<Record<string, string>>,
  session: Session,
): TransformResult {
  const pieces: string[] = [];
  let cursor = 0;
  let outputLength = 0;
  const applied = result.applied.map((a) => {
    const target = assignments[a.detectionId];
    let replacement = a.replacement;
    if (target && a.operator === "pseudonymize") {
      const entity = session.byPseudonym(target);
      if (!entity || a.entityType !== "PERSON" || entity.entityType !== a.entityType) {
        throw new TransformError("Rattachement indisponible : choisissez de nouveau la personne.");
      }
      replacement = entity.pseudonym;
    }
    const gap = result.text.slice(cursor, a.outputStart);
    pieces.push(gap, replacement);
    outputLength += gap.length;
    const updated = { ...a, replacement, outputStart: outputLength };
    outputLength += replacement.length;
    cursor = a.outputEnd;
    return { ...updated, outputEnd: outputLength };
  });
  pieces.push(result.text.slice(cursor));
  return { ...result, text: pieces.join(""), applied };
}
