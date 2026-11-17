import type {
  AppliedTransformation,
  Detection,
  OperatorId,
  Session,
  TransformPlan,
  TransformResult,
} from "../types/index.ts";
import { OPERATORS } from "./operators/index.ts";

/**
 * Erreur de transformation. Son message ne contient jamais de valeur
 * originale (R5) : uniquement des identifiants de détection et des positions.
 */
export class TransformError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TransformError";
  }
}

/** Vrai si une borne tombe entre les deux moitiés d'une paire de substitution UTF-16. */
function splitsSurrogatePair(text: string, index: number): boolean {
  if (index <= 0 || index >= text.length) return false;
  const before = text.charCodeAt(index - 1);
  const after = text.charCodeAt(index);
  return before >= 0xd800 && before <= 0xdbff && after >= 0xdc00 && after <= 0xdfff;
}

function chooseOperator(d: Detection, plan: TransformPlan): OperatorId {
  const id =
    plan.byDetectionId?.[d.id] ?? plan.byEntityType?.[d.entityType] ?? plan.defaultOperator;
  if (!Object.hasOwn(OPERATORS, id)) {
    throw new TransformError(`Opérateur inconnu pour la détection ${d.id}.`);
  }
  if (plan.mode === "masking" && id === "pseudonymize") {
    throw new TransformError(
      `L'opérateur pseudonymize est interdit en mode masquage (détection ${d.id}).`,
    );
  }
  return id;
}

/**
 * Applique un plan de transformation à un texte.
 *
 * Priorité des opérateurs : `byDetectionId` > `byEntityType` > `defaultOperator`.
 *
 * 1. Validation : toute détection hors du texte, vide, chevauchante ou dont
 *    une borne coupe une paire de substitution UTF-16 (R7) fait échouer l'appel (`TransformError`) avant tout remplacement.
 * 2. Résolution : les remplacements sont calculés dans l'ORDRE DU TEXTE, de
 *    sorte que la première personne citée reçoive `PERSONNE_001`.
 * 3. Assemblage : le texte final est construit en une passe, chaque
 *    remplacement recevant sa position (`outputStart`/`outputEnd`) dans le
 *    texte FINAL. Les positions d'entrée restent celles du texte original (R7).
 *
 * `applied` et les erreurs ne contiennent jamais la valeur originale (R5).
 * `applied` est trié par position croissante.
 */
export function transform(
  text: string,
  detections: readonly Detection[],
  plan: TransformPlan,
  session?: Session,
): TransformResult {
  const sorted = [...detections].sort((a, b) => a.start - b.start || a.end - b.end);

  let previous: Detection | undefined;
  for (const d of sorted) {
    if (!Number.isInteger(d.start) || !Number.isInteger(d.end)) {
      throw new TransformError(`Positions non entières pour la détection ${d.id}.`);
    }
    if (d.start < 0 || d.end > text.length) {
      throw new TransformError(
        `La détection ${d.id} (${d.start}-${d.end}) sort du texte (longueur ${text.length}).`,
      );
    }
    if (d.start >= d.end) {
      throw new TransformError(`La détection ${d.id} (${d.start}-${d.end}) est vide ou inversée.`);
    }
    if (splitsSurrogatePair(text, d.start) || splitsSurrogatePair(text, d.end)) {
      throw new TransformError(
        `La détection ${d.id} (${d.start}-${d.end}) coupe un caractère codé sur deux unités UTF-16.`,
      );
    }
    if (previous && d.start < previous.end) {
      throw new TransformError(
        `Les détections ${previous.id} et ${d.id} se chevauchent (${previous.start}-${previous.end} et ${d.start}-${d.end}).`,
      );
    }
    previous = d;
  }

  // Choix des opérateurs avant toute résolution : un plan invalide ne laisse
  // aucune entité créée dans la session.
  const operators = sorted.map((d) => chooseOperator(d, plan));

  const replacements = sorted.map((d, i) => {
    const operator = OPERATORS[operators[i] as OperatorId];
    return operator.apply({
      value: text.slice(d.start, d.end),
      detection: d,
      session: operators[i] === "pseudonymize" ? session : undefined,
    });
  });

  const pieces: string[] = [];
  const applied: AppliedTransformation[] = [];
  let cursor = 0;
  let outputLength = 0;
  sorted.forEach((d, i) => {
    const replacement = replacements[i] as string;
    const gap = text.slice(cursor, d.start);
    pieces.push(gap, replacement);
    outputLength += gap.length;
    applied.push({
      detectionId: d.id,
      entityType: d.entityType,
      operator: operators[i] as OperatorId,
      originalStart: d.start,
      originalEnd: d.end,
      outputStart: outputLength,
      outputEnd: outputLength + replacement.length,
      replacement,
    });
    outputLength += replacement.length;
    cursor = d.end;
  });
  pieces.push(text.slice(cursor));

  return { text: pieces.join(""), applied, errors: [] };
}
