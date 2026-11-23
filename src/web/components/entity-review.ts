/**
 * Liste « À vérifier » du parcours sur une page (#38). Logique pure, sans DOM.
 *
 * Regroupe les détections du texte courant par entité : en pseudonymisation, une ligne par
 * pseudonyme de la session (ses formes rencontrées dans ce texte) ; en masquage, une ligne par
 * type et valeur. Les détections retirées par l'utilisateur restent listées, case décochée,
 * pour pouvoir les rétablir. Les valeurs ne servent qu'à l'affichage local (R5).
 */
import {
  normalizeForm,
  type AnalysisResult,
  type Detection,
  type EntityType,
  type Mode,
  type Session,
  type TransformResult,
} from "../../core/index.ts";
import type { Corrections } from "../state.svelte.ts";

export interface ReviewForm {
  /** Valeur telle qu'elle figure dans le texte (affichage local seulement). */
  value: string;
  /** Détections de cette forme, dans l'ordre du texte. */
  detectionIds: string[];
  /** Vrai si la forme est remplacée ; faux si l'utilisateur l'a retirée. */
  active: boolean;
}

export interface ReviewGroup {
  /** Clé stable pour l'affichage (`{#each}`). */
  key: string;
  /** Pseudonyme en pseudonymisation (`PERSONNE_001`), `null` sinon. */
  pseudonym: string | null;
  entityType: EntityType;
  /** Entité de la session, pour séparer et rattacher (pseudonymisation seulement). */
  sessionEntityId: string | null;
  needsReview: boolean;
  forms: ReviewForm[];
}

export interface EntityGroupsInput {
  text: string;
  analysis: AnalysisResult | null;
  corrections: Corrections;
  /** Détections effectivement remplacées (`app.detections`). */
  detections: readonly Detection[];
  transformed: TransformResult | null;
  session: Session | null;
  mode: Mode;
}

/**
 * Construit la liste. Une détection écartée par le choix des catégories n'y figure pas :
 * ce choix se règle dans la barre d'outils.
 */
export function entityGroups(input: EntityGroupsInput): ReviewGroup[] {
  const { text, analysis, corrections, detections, transformed, session, mode } = input;
  if (!analysis) return [];
  const typeOf = (d: Detection): EntityType => corrections.typeOverrides[d.id] ?? d.entityType;
  const valueOf = (d: Detection): string => text.slice(d.start, d.end);
  const activeIds = new Set(detections.map((d) => d.id));
  const removed = analysis.detections.filter(
    (d) => corrections.removedIds.includes(d.id) && !activeIds.has(d.id),
  );
  const listed = [...detections, ...removed].sort((a, b) => a.start - b.start || a.end - b.end);

  const replacementOf = new Map<string, string>();
  if (mode === "pseudonymization" && transformed) {
    for (const a of transformed.applied) replacementOf.set(a.detectionId, a.replacement);
  }

  const groups = new Map<string, ReviewGroup>();
  const order: string[] = [];

  for (const d of listed) {
    const type = typeOf(d);
    const value = valueOf(d);
    const active = activeIds.has(d.id);
    const entity =
      mode === "pseudonymization" && session
        ? findEntity(session, replacementOf.get(d.id), value, type)
        : undefined;
    const key = entity ? `e:${entity.id}` : `v:${type}:${normalizeForm(value, type)}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        pseudonym: entity?.pseudonym ?? null,
        entityType: entity?.entityType ?? type,
        sessionEntityId: entity?.id ?? null,
        needsReview: entity?.needsReview ?? false,
        forms: [],
      };
      groups.set(key, group);
      order.push(key);
    }
    let form = group.forms.find((f) => f.value === value);
    if (!form) {
      form = { value, detectionIds: [], active: false };
      group.forms.push(form);
    }
    form.detectionIds.push(d.id);
    // Une forme est active si une de ses occurrences au moins est remplacée.
    form.active ||= active;
  }
  return order.map((k) => groups.get(k)!);
}

/** Entité de la session : par le pseudonyme appliqué, sinon (forme retirée) par la forme connue. */
function findEntity(
  session: Session,
  replacement: string | undefined,
  value: string,
  type: EntityType,
) {
  if (replacement) {
    const byPseudonym = session.byPseudonym(replacement);
    if (byPseudonym) return byPseudonym;
  }
  const key = normalizeForm(value, type);
  return session
    .entities()
    .find(
      (e) => e.entityType === type && e.surfaceForms.some((f) => normalizeForm(f, type) === key),
    );
}

/** Nombre d'occurrences remplacées, pour le résumé de la colonne. */
export function activeOccurrences(groups: readonly ReviewGroup[]): number {
  let n = 0;
  for (const g of groups) for (const f of g.forms) if (f.active) n += f.detectionIds.length;
  return n;
}

/** Entités de même type auxquelles rattacher `group` (pseudonymisation seulement). */
export function mergeTargets(groups: readonly ReviewGroup[], group: ReviewGroup): ReviewGroup[] {
  if (!group.sessionEntityId) return [];
  return groups.filter(
    (g) =>
      g.sessionEntityId !== null &&
      g.sessionEntityId !== group.sessionEntityId &&
      g.entityType === group.entityType,
  );
}
