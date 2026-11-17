import type { Entity, EntityType, Session } from "../types/index.ts";
import { formatPseudonym } from "./pseudonym.ts";
import { matchSurfaceForm, normalizeForm } from "./resolution.ts";

export interface SessionOptions {
  /** Identifiant de session ; généré si absent. */
  id?: string;
}

/**
 * Pseudonyme retiré par une fusion : désigne l'entité cible, tant que ce
 * lien reste univoque.
 */
export interface AliasRecord {
  /** Id de l'entité qui a absorbé l'entité d'origine. */
  target: string;
  /**
   * Formes (normalisées) de l'entité absorbée au moment de la fusion. Liste
   * vide = formes inconnues (ancien format v1) : toute scission de la cible
   * rend alors l'alias ambigu.
   */
  forms: string[];
  /** Vrai si une scission partielle rend le lien incertain. */
  ambiguous: boolean;
}

/** État interne d'une session, sans le format de fichier (voir `snapshot.ts`). */
export interface SessionState {
  id: string;
  entities: Entity[];
  counters: Partial<Record<EntityType, number>>;
  /** Pseudonymes d'entités fusionnées → entité qui les a absorbées. */
  aliases: Record<string, AliasRecord>;
  sequence: number;
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

function copyAlias(a: AliasRecord): AliasRecord {
  return { target: a.target, forms: [...a.forms], ambiguous: a.ambiguous };
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
 *   pseudonyme reste réidentifiable. L'alias garde les formes normalisées de
 *   l'entité absorbée.
 * - Scission : si les formes détachées sont exactement celles d'un alias, la
 *   nouvelle entité reprend le pseudonyme d'origine (aucun nouveau numéro) et
 *   l'alias disparaît. Si elles n'en couvrent qu'une partie, l'alias devient
 *   ambigu : `byPseudonym` ne le résout plus et `isAmbiguousPseudonym` le
 *   signale (à afficher à la réidentification plutôt que de deviner).
 * - `merge` confirme le regroupement : `needsReview` de la cible passe à faux.
 */
export class InMemorySession implements Session {
  readonly id: string;
  readonly #entities = new Map<string, Entity>();
  readonly #counters = new Map<EntityType, number>();
  /** Pseudonymes d'entités fusionnées → id de l'entité qui les a absorbées. */
  readonly #retired = new Map<string, AliasRecord>();
  #sequence = 0;

  constructor(options: SessionOptions = {}) {
    this.id = options.id ?? generateId();
  }

  /**
   * État interne complet, en copie profonde (données sensibles, R5 : à ne
   * jamais écrire en clair). Utilisé par `serializeSession`.
   */
  exportState(): SessionState {
    return {
      id: this.id,
      entities: this.entities().map((e) => ({ ...e })),
      counters: Object.fromEntries(this.#counters),
      aliases: Object.fromEntries([...this.#retired].map(([p, a]) => [p, copyAlias(a)])),
      sequence: this.#sequence,
    };
  }

  /** Reconstruit une session depuis un état déjà validé (voir `restoreSession`). */
  static fromState(state: SessionState): InMemorySession {
    const session = new InMemorySession({ id: state.id });
    for (const e of state.entities) {
      session.#entities.set(e.id, { ...e, surfaceForms: [...e.surfaceForms] });
    }
    for (const [type, n] of Object.entries(state.counters)) {
      session.#counters.set(type as EntityType, n);
    }
    for (const [pseudonym, alias] of Object.entries(state.aliases)) {
      session.#retired.set(pseudonym, copyAlias(alias));
    }
    session.#sequence = state.sequence;
    return session;
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
    for (const alias of this.#retired.values()) {
      if (alias.target === sourceId) alias.target = targetId;
    }
    this.#retired.set(source.pseudonym, {
      target: targetId,
      forms: [...new Set(source.surfaceForms.map((f) => normalizeForm(f, source.entityType)))],
      ambiguous: false,
    });
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
    // Les formes détachées reprennent le pseudonyme d'un alias qu'elles
    // couvrent entièrement ; tout autre alias touché devient ambigu.
    let reclaimed: string | undefined;
    for (const [pseudonym, alias] of this.#retired) {
      if (alias.target !== entityId || alias.ambiguous) continue;
      if (alias.forms.length === 0) {
        alias.ambiguous = true;
      } else if (alias.forms.includes(key)) {
        if (reclaimed === undefined && alias.forms.every((f) => f === key)) reclaimed = pseudonym;
        else alias.ambiguous = true;
      }
    }
    if (reclaimed !== undefined) this.#retired.delete(reclaimed);
    return snapshot(this.#create(entity.entityType, moved, false, reclaimed));
  }

  byPseudonym(pseudonym: string): Entity | undefined {
    for (const e of this.#entities.values()) if (e.pseudonym === pseudonym) return snapshot(e);
    const alias = this.#retired.get(pseudonym);
    if (!alias || alias.ambiguous) return undefined;
    const entity = this.#entities.get(alias.target);
    return entity && snapshot(entity);
  }

  /**
   * Vrai si ce pseudonyme était celui d'une entité fusionnée puis en partie
   * scindée : on ne sait plus à qui il se rapporte (`byPseudonym` renvoie
   * undefined). À signaler à la réidentification.
   */
  isAmbiguousPseudonym(pseudonym: string): boolean {
    const alias = this.#retired.get(pseudonym);
    return alias !== undefined && alias.ambiguous && this.#entities.has(alias.target);
  }

  #get(id: string): Entity {
    const entity = this.#entities.get(id);
    if (!entity) throw new Error("Entité inconnue dans cette session.");
    return entity;
  }

  #create(
    entityType: EntityType,
    surfaceForms: string[],
    needsReview: boolean,
    reusedPseudonym?: string,
  ): Entity {
    let pseudonym = reusedPseudonym;
    if (pseudonym === undefined) {
      const n = (this.#counters.get(entityType) ?? 0) + 1;
      this.#counters.set(entityType, n);
      pseudonym = formatPseudonym(entityType, n);
    }
    this.#sequence += 1;
    const entity: Entity = {
      id: `entity-${this.#sequence}`,
      entityType,
      pseudonym,
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
