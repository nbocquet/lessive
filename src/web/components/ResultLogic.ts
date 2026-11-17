/**
 * Logique pure de l'aperçu et de la sortie (T5.4) : segments mis en évidence,
 * texte à copier avec la consigne, noms de fichiers, avertissements.
 *
 * Aucun accès au DOM ici : tout est testable sous Node. Les valeurs originales ne
 * sont ni journalisées ni reprises dans un message (R5).
 */
import {
  buildPromptNotice,
  type AppliedTransformation,
  type EntityType,
  type Mode,
  type OperatorId,
  type TransformResult,
} from "../../core/index.ts";

export type NoticeLanguage = "fr" | "en";

/** Morceau de texte : `marked` vaut vrai pour un remplacement (côté après) ou une valeur remplacée (côté avant). */
export interface Segment {
  text: string;
  marked: boolean;
  entityType?: EntityType;
  operator?: OperatorId;
}

interface Range {
  start: number;
  end: number;
  entityType: EntityType;
  operator: OperatorId;
}

/**
 * Découpe `text` en segments neutres et marqués. Les intervalles vides, hors du
 * texte ou chevauchants sont ignorés (défensif : le moteur n'en produit pas).
 */
export function segmentText(text: string, ranges: readonly Range[]): Segment[] {
  const sorted = [...ranges].sort((a, b) => a.start - b.start || a.end - b.end);
  const out: Segment[] = [];
  let cursor = 0;
  for (const r of sorted) {
    if (r.start < cursor || r.end <= r.start || r.end > text.length) continue;
    if (r.start > cursor) out.push({ text: text.slice(cursor, r.start), marked: false });
    out.push({
      text: text.slice(r.start, r.end),
      marked: true,
      entityType: r.entityType,
      operator: r.operator,
    });
    cursor = r.end;
  }
  if (cursor < text.length) out.push({ text: text.slice(cursor), marked: false });
  return out;
}

function outputRange(a: AppliedTransformation): Range {
  return {
    start: a.outputStart,
    end: a.outputEnd,
    entityType: a.entityType,
    operator: a.operator,
  };
}

function originalRange(a: AppliedTransformation): Range {
  return {
    start: a.originalStart,
    end: a.originalEnd,
    entityType: a.entityType,
    operator: a.operator,
  };
}

/** Texte transformé, remplacements en évidence (un remplacement vide, par suppression, n'a rien à montrer). */
export function outputSegments(result: TransformResult): Segment[] {
  return segmentText(result.text, result.applied.map(outputRange));
}

/** Texte original, valeurs remplacées en évidence. */
export function originalSegments(original: string, result: TransformResult): Segment[] {
  return segmentText(original, result.applied.map(originalRange));
}

/** Consigne à joindre au prompt, dans la langue demandée. */
export function noticeText(language: NoticeLanguage): string {
  return buildPromptNotice()[language];
}

export interface CopyOptions {
  /** Préfixe le texte de la consigne pour l'IA. */
  withNotice: boolean;
  language: NoticeLanguage;
}

/** Texte envoyé au presse-papiers : consigne, ligne vide, puis le texte transformé. */
export function buildCopyText(transformed: string, options: CopyOptions): string {
  if (!options.withNotice) return transformed;
  return `${noticeText(options.language)}\n\n${transformed}`;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Date locale `AAAA-MM-JJ`. */
export function formatDateStamp(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Nom du fichier de résultat téléchargé. */
export function resultFileName(date: Date = new Date()): string {
  return `lessive-resultat-${formatDateStamp(date)}.txt`;
}

export type WarningKind = "limit" | "discarded" | "analysis" | "untreated" | "info";

export interface ResultWarning {
  kind: WarningKind;
  text: string;
}

export interface WarningInput {
  mode: Mode;
  detectionCount: number;
  /** Détections écartées par le moteur (sous le seuil ou perdantes d'un conflit). */
  discardedCount: number;
  /** Détections du moteur supprimées par l'utilisateur. */
  removedCount: number;
  /** Avertissements de l'analyse (NER inactif, etc.). */
  analysisWarnings: readonly string[];
  /** Erreurs non bloquantes de la transformation. */
  transformErrors: readonly string[];
}

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

/** Avertissements à afficher avec le résultat, dans l'ordre : limites, écartées, analyse, non traité. */
export function buildWarnings(input: WarningInput): ResultWarning[] {
  const out: ResultWarning[] = [];
  out.push({
    kind: "limit",
    text: "L'identification indirecte n'est pas traitée : une fonction, un lieu et une date combinés peuvent suffire à reconnaître une personne.",
  });
  out.push({
    kind: "limit",
    text: "Une donnée non détectée reste telle quelle dans le résultat : relisez le texte en entier avant de le copier.",
  });
  if (input.mode === "masking") {
    out.push({
      kind: "limit",
      text: "En mode Masquage, les valeurs d'origine ne sont pas conservées : la réponse du LLM ne pourra pas être réidentifiée.",
    });
  }
  if (input.detectionCount === 0) {
    out.push({
      kind: "info",
      text: "Aucune détection retenue : le texte est identique à l'original.",
    });
  }
  if (input.discardedCount > 0) {
    out.push({
      kind: "discarded",
      text: `${input.discardedCount} ${plural(input.discardedCount, "détection écartée", "détections écartées")} par l'analyse (score sous le seuil ou chevauchement) ${plural(input.discardedCount, "n'est pas appliquée", "ne sont pas appliquées")} : vérifiez que les passages concernés peuvent rester en clair.`,
    });
  }
  if (input.removedCount > 0) {
    out.push({
      kind: "discarded",
      text: `${input.removedCount} ${plural(input.removedCount, "détection supprimée", "détections supprimées")} à la vérification ${plural(input.removedCount, "n'est pas appliquée", "ne sont pas appliquées")} : le texte correspondant reste en clair.`,
    });
  }
  for (const w of input.analysisWarnings) out.push({ kind: "analysis", text: w });
  for (const e of input.transformErrors) {
    out.push({ kind: "untreated", text: `Partie non traitée : ${e}` });
  }
  return out;
}
