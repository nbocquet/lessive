import type { Entity, EntityType, Session } from "../types/index.ts";
import { formatPseudonym } from "./pseudonym.ts";
import { matchSurfaceForm, normalizeForm } from "./resolution.ts";

export interface SessionOptions {
  /** Identifiant de session ; généré si absent. */
  id?: string;
}

function generateId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  return c?.randomUUID
    ? c.randomUUID()
    : `session-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function snapshot(e: Entity): Entity {
  return { ...e, surfaceForms: [...e.surfaceForms] };
}

/**
 * Session en mémoire (R5 : rien n'est persisté ni loggé).
 *
 * - Pseudonymes uniques par type, numérotés par un compteur par type qui ne
 *   revient jamais en arrière : un numéro n'est pas réutilisé après fusion.
 * - Le texte original ne sort que par `entities()` (et les copies renvoyées
 *   par les autres méthodes) : les objets renvoyés sont des copies, modifier
 *   une copie ne change pas la session, et une copie ancienne n'est pas mise
 *   à jour (relire par `entities()`).
 * - Après une fusion, le pseudonyme de la source reste résolu par
 *   `byPseudonym` (il désigne la cible) : un texte déjà produit avec ce
 *   pseudonyme reste réidentifiable.
 * - `merge` confirme le regroupement : `needsReview` de la cible passe à faux.
 */
export class InMemorySession implements Session {
  readonly id: string;
  readonly #entities = new Map<string, Entity>();
  readonly #counters = new Map<EntityType, number>();
  /** Pseudonymes d'entités fusionnées → id de l'entité qui les a absorbées. */
  readonly #retired = new Map<string, string>();
  #sequence = 0;

  constructor(options: SessionOptions = {}) {
    this.id = options.id ?? generateId();
  }

  resolve(surfaceForm: string, entityType: EntityType): Entity {
    const form = surfaceForm.trim();
    if (normalizeForm(form, entityType) === "") {
      throw new Error("Forme vide : impossible de résoudre une entité.");
    }
    const match = matchSurfaceForm(form, entityType, [...this.#entities.values()]);
    if (match.outcome === "new") {
      return snapshot(this.#create(entityType, [form], match.needsReview));
    }
    const entity = this.#get(match.entity.id);
    if (!entity.surfaceForms.includes(form)) entity.surfaceForms.push(form);
    if (match.outcome === "attached") entity.needsReview = true;
    return snapshot(entity);
  }

  entities(): readonly Entity[] {
    return [...this.#entities.values()].map(snapshot);
  }

  merge(targetId: string, sourceId: string): void {
    if (targetId === sourceId)
      throw new Error("Impossible de fusionner une entité avec elle-même.");
    const target = this.#get(targetId);
    const source = this.#get(sourceId);
    if (target.entityType !== source.entityType) {
      throw new Error("Impossible de fusionner des entités de types différents.");
    }
    for (const f of source.surfaceForms) {
      if (!target.surfaceForms.includes(f)) target.surfaceForms.push(f);
    }
    target.needsReview = false;
    this.#entities.delete(sourceId);
    this.#retired.set(source.pseudonym, targetId);
    for (const [pseudonym, id] of this.#retired) {
      if (id === sourceId) this.#retired.set(pseudonym, targetId);
    }
  }

  split(entityId: string, surfaceForm: string): Entity {
    const entity = this.#get(entityId);
    const key = normalizeForm(surfaceForm, entity.entityType);
    const moved = entity.surfaceForms.filter((f) => normalizeForm(f, entity.entityType) === key);
    if (moved.length === 0) throw new Error("Cette forme n'appartient pas à l'entité.");
    if (moved.length === entity.surfaceForms.length) {
      throw new Error("Impossible de scinder la seule forme d'une entité.");
    }
    entity.surfaceForms = entity.surfaceForms.filter((f) => !moved.includes(f));
    return snapshot(this.#create(entity.entityType, moved, false));
  }

  byPseudonym(pseudonym: string): Entity | undefined {
    for (const e of this.#entities.values()) if (e.pseudonym === pseudonym) return snapshot(e);
    const id = this.#retired.get(pseudonym);
    const entity = id === undefined ? undefined : this.#entities.get(id);
    return entity && snapshot(entity);
  }

  #get(id: string): Entity {
    const entity = this.#entities.get(id);
    if (!entity) throw new Error("Entité inconnue dans cette session.");
    return entity;
  }

  #create(entityType: EntityType, surfaceForms: string[], needsReview: boolean): Entity {
    const n = (this.#counters.get(entityType) ?? 0) + 1;
    this.#counters.set(entityType, n);
    this.#sequence += 1;
    const entity: Entity = {
      id: `entity-${this.#sequence}`,
      entityType,
      pseudonym: formatPseudonym(entityType, n),
      surfaceForms: [...surfaceForms],
      needsReview,
    };
    this.#entities.set(entity.id, entity);
    return entity;
  }
}

/** Crée une session vide en mémoire. */
export function createSession(options?: SessionOptions): Session {
  return new InMemorySession(options);
}
