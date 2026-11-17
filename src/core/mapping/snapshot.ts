/**
 * Instantané sérialisable d'une session (T4.3).
 *
 * Un `SessionSnapshot` est un objet en mémoire contenant les formes
 * originales : le moteur ne l'écrit jamais en clair (R5). Il sort du
 * processus uniquement via `encryptSnapshot` (src/core/crypto).
 *
 * Les messages d'erreur de validation ne citent que des chemins de champs,
 * jamais une valeur du snapshot.
 */
import { z } from "zod";
import { ENTITY_TYPES } from "../types/index.ts";
import type { Entity, EntityType, Session } from "../types/index.ts";
import { ENTITY_LABELS } from "../transform/labels.ts";
import { formatPseudonym } from "./pseudonym.ts";
import { normalizeForm } from "./resolution.ts";
import { InMemorySession } from "./session.ts";
import type { AliasRecord } from "./session.ts";

export const SNAPSHOT_FORMAT = "lessive-session";
/**
 * Version 2 : les alias portent les formes normalisées de l'entité absorbée
 * et un indicateur d'ambiguïté (voir `AliasRecord`). La version 1 (alias =
 * simple id de la cible) reste lisible : ses alias sont migrés avec des formes
 * inconnues (liste vide).
 */
export const SNAPSHOT_VERSION = 2;

export interface SessionSnapshot {
  format: typeof SNAPSHOT_FORMAT;
  version: typeof SNAPSHOT_VERSION;
  sessionId: string;
  entities: Entity[];
  /** Dernier numéro attribué, par type d'entité. */
  counters: Partial<Record<EntityType, number>>;
  /** Pseudonymes d'entités fusionnées → entité qui les a absorbées. */
  aliases: Record<string, AliasRecord>;
  /** Séquence des identifiants d'entités. */
  sequence: number;
}

export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SnapshotError";
  }
}

const entityTypeSchema = z.enum(ENTITY_TYPES);
const counterSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);

const entitySchema = z.strictObject({
  id: z.string().min(1),
  entityType: entityTypeSchema,
  pseudonym: z.string().min(1),
  surfaceForms: z.array(z.string()).min(1),
  needsReview: z.boolean(),
});

const aliasSchema = z.strictObject({
  target: z.string().min(1),
  forms: z.array(z.string()),
  ambiguous: z.boolean(),
});

const snapshotShape = {
  format: z.literal(SNAPSHOT_FORMAT),
  sessionId: z.string().min(1),
  entities: z.array(entitySchema),
  counters: z.partialRecord(entityTypeSchema, counterSchema),
  sequence: counterSchema,
};

const snapshotSchema = z.strictObject({
  ...snapshotShape,
  version: z.literal(SNAPSHOT_VERSION),
  aliases: z.record(z.string(), aliasSchema),
});

const snapshotSchemaV1 = z.strictObject({
  ...snapshotShape,
  version: z.literal(1),
  aliases: z.record(z.string(), z.string()),
});

function fail(reason: string): never {
  throw new SnapshotError(`Instantané de session invalide : ${reason}.`);
}

/** Numéro d'un pseudonyme `LIBELLE_NNN` du type donné, ou undefined. */
function pseudonymNumber(pseudonym: string, type: EntityType): number | undefined {
  const prefix = `${ENTITY_LABELS[type]}_`;
  if (!pseudonym.startsWith(prefix)) return undefined;
  const digits = pseudonym.slice(prefix.length);
  if (!/^\d+$/.test(digits)) return undefined;
  const n = Number(digits);
  return formatPseudonym(type, n) === pseudonym ? n : undefined;
}

/** Version 1 → 2 : formes d'alias inconnues (vide), donc non ambiguës a priori. */
function migrateV1(v1: z.infer<typeof snapshotSchemaV1>): SessionSnapshot {
  return {
    ...v1,
    version: SNAPSHOT_VERSION,
    aliases: Object.fromEntries(
      Object.entries(v1.aliases).map(([p, target]) => [p, { target, forms: [], ambiguous: false }]),
    ),
  };
}

/**
 * Valide strictement un instantané (structure puis cohérence interne) et le
 * renvoie typé. Lève `SnapshotError` sans citer aucune valeur.
 */
export function validateSnapshot(input: unknown): SessionSnapshot {
  const isV1 =
    typeof input === "object" && input !== null && (input as { version?: unknown }).version === 1;
  const parsed = isV1 ? snapshotSchemaV1.safeParse(input) : snapshotSchema.safeParse(input);
  if (!parsed.success) {
    const paths = [
      ...new Set(
        parsed.error.issues.map(
          (i) =>
            i.path.map((p) => (typeof p === "number" ? "[]" : "." + String(p))).join("") ||
            "(racine)",
        ),
      ),
    ];
    fail(`structure ou format non conforme (${paths.slice(0, 5).join(", ")})`);
  }
  const snap = (
    isV1
      ? migrateV1(parsed.data as z.infer<typeof snapshotSchemaV1>)
      : (parsed.data as SessionSnapshot)
  ) satisfies SessionSnapshot;

  const ids = new Set<string>();
  const pseudonyms = new Set<string>();
  const maxByType = new Map<EntityType, number>();
  let maxSequence = 0;
  for (const e of snap.entities) {
    if (ids.has(e.id)) fail("identifiant d'entité en double");
    ids.add(e.id);
    if (pseudonyms.has(e.pseudonym)) fail("pseudonyme en double");
    pseudonyms.add(e.pseudonym);
    const n = pseudonymNumber(e.pseudonym, e.entityType);
    if (n === undefined) fail("pseudonyme incohérent avec le type d'entité");
    maxByType.set(e.entityType, Math.max(maxByType.get(e.entityType) ?? 0, n));
    const m = /^entity-(\d+)$/.exec(e.id);
    if (m) maxSequence = Math.max(maxSequence, Number(m[1]));
  }

  const typeById = new Map(snap.entities.map((e) => [e.id, e.entityType]));
  const formsById = new Map(snap.entities.map((e) => [e.id, e]));
  for (const [alias, record] of Object.entries(snap.aliases)) {
    if (pseudonyms.has(alias)) fail("alias identique au pseudonyme d'une entité");
    const type = typeById.get(record.target);
    if (type === undefined) fail("alias vers une entité absente");
    const n = pseudonymNumber(alias, type);
    if (n === undefined) fail("alias incohérent avec le type de l'entité cible");
    if (!record.ambiguous && record.forms.length > 0) {
      const known = new Set(
        formsById.get(record.target)!.surfaceForms.map((f) => normalizeForm(f, type)),
      );
      if (!record.forms.every((f) => known.has(f))) {
        fail("alias non couvert par les formes de l'entité cible");
      }
    }
    maxByType.set(type, Math.max(maxByType.get(type) ?? 0, n));
  }

  for (const [type, max] of maxByType) {
    if ((snap.counters[type] ?? 0) < max) {
      fail("compteur inférieur à un numéro déjà attribué (risque de réutilisation)");
    }
  }
  if (snap.sequence < maxSequence) {
    fail("séquence d'identifiants inférieure à un identifiant existant");
  }
  return snap;
}

/** Produit un instantané en mémoire d'une session (copie profonde). */
export function serializeSession(session: Session): SessionSnapshot {
  if (!(session instanceof InMemorySession)) {
    throw new SnapshotError("Seule une session en mémoire de Lessive peut être sérialisée.");
  }
  const state = session.exportState();
  return validateSnapshot({
    format: SNAPSHOT_FORMAT,
    version: SNAPSHOT_VERSION,
    sessionId: state.id,
    entities: state.entities,
    counters: state.counters,
    aliases: state.aliases,
    sequence: state.sequence,
  });
}

/** Recrée une session depuis un instantané ; le valide strictement d'abord. */
export function restoreSession(snapshot: unknown): Session {
  const snap = validateSnapshot(snapshot);
  return InMemorySession.fromState({
    id: snap.sessionId,
    entities: snap.entities,
    counters: snap.counters,
    aliases: snap.aliases,
    sequence: snap.sequence,
  });
}
