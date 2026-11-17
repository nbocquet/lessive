/**
 * Logique pure de la table des pseudonymes et de l'export/import chiffrés (T5.5).
 *
 * Sans accès au DOM. La phrase de passe n'est jamais conservée ici : elle transite
 * seulement par les paramètres des fonctions et n'apparaît dans aucun message (R5).
 * Les formes originales ne sont ni journalisées ni reprises dans un message d'erreur.
 */
import {
  CryptoFormatError,
  ENTITY_LABELS,
  MIN_PASSPHRASE_LENGTH,
  SnapshotError,
  decryptSnapshot,
  encryptSnapshot,
  normalizeForm,
  restoreSession,
  serializeSession,
  type Entity,
  type EntityType,
  type Session,
} from "../../core/index.ts";
import { formatDateStamp } from "./ResultLogic.ts";

/** Taille maximale d'un fichier de correspondances accepté à l'import (protection mémoire). */
export const MAX_IMPORT_BYTES = 10 * 1024 * 1024;

export { MIN_PASSPHRASE_LENGTH };

// ----------------------------------------------------------------------
// Affichage des entités
// ----------------------------------------------------------------------

export interface EntityRow {
  id: string;
  pseudonym: string;
  entityType: EntityType;
  /** Libellé français de la catégorie, identique au préfixe du pseudonyme. */
  categoryLabel: string;
  /** Formes rencontrées (affichage local seulement), sans doublon exact. */
  forms: string[];
  needsReview: boolean;
  /** Vrai si l'entité a au moins deux formes distinctes : une scission a un sens. */
  splittable: boolean;
}

/**
 * Prépare les lignes de la liste : entités « à vérifier » d'abord, puis par
 * catégorie, puis par pseudonyme (ordre naturel : `_002` avant `_010`).
 */
export function entityRows(entities: readonly Entity[]): EntityRow[] {
  const rows = entities.map<EntityRow>((e) => {
    const keys = new Set(e.surfaceForms.map((f) => normalizeForm(f, e.entityType)));
    return {
      id: e.id,
      pseudonym: e.pseudonym,
      entityType: e.entityType,
      categoryLabel: ENTITY_LABELS[e.entityType],
      forms: [...new Set(e.surfaceForms)],
      needsReview: e.needsReview,
      splittable: keys.size > 1,
    };
  });
  return rows.sort(
    (a, b) =>
      Number(b.needsReview) - Number(a.needsReview) ||
      a.categoryLabel.localeCompare(b.categoryLabel, "fr") ||
      a.pseudonym.localeCompare(b.pseudonym, "fr", { numeric: true }),
  );
}

/** Entités avec lesquelles `id` peut fusionner : même catégorie, autre identifiant. */
export function mergeCandidates(rows: readonly EntityRow[], id: string): EntityRow[] {
  const self = rows.find((r) => r.id === id);
  if (!self) return [];
  return rows.filter((r) => r.id !== id && r.entityType === self.entityType);
}

export function countNeedingReview(rows: readonly EntityRow[]): number {
  return rows.filter((r) => r.needsReview).length;
}

// ----------------------------------------------------------------------
// Phrase de passe
// ----------------------------------------------------------------------

export type PassphraseIssue = "too-short" | "mismatch" | "invalid";

export type PassphraseCheck = { ok: true } | { ok: false; issue: PassphraseIssue; message: string };

const LONE_SURROGATE = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/;

/** Longueur en caractères (points de code, après normalisation NFC) : celle que mesure le moteur. */
export function passphraseLength(passphrase: string): number {
  return [...passphrase.normalize("NFC")].length;
}

/**
 * Vérifie une nouvelle phrase de passe saisie deux fois (export). Les messages ne
 * citent jamais la phrase.
 */
export function validateNewPassphrase(passphrase: string, confirmation: string): PassphraseCheck {
  if (LONE_SURROGATE.test(passphrase)) {
    return {
      ok: false,
      issue: "invalid",
      message: "La phrase de passe contient une séquence de caractères invalide.",
    };
  }
  if (passphraseLength(passphrase) < MIN_PASSPHRASE_LENGTH) {
    return {
      ok: false,
      issue: "too-short",
      message: `La phrase de passe est trop courte : ${MIN_PASSPHRASE_LENGTH} caractères au minimum.`,
    };
  }
  if (passphrase !== confirmation) {
    return {
      ok: false,
      issue: "mismatch",
      message: "Les deux saisies de la phrase de passe sont différentes.",
    };
  }
  return { ok: true };
}

// ----------------------------------------------------------------------
// Fichiers
// ----------------------------------------------------------------------

/** Nom du fichier d'export : `lessive-correspondances-AAAA-MM-JJ.json`. */
export function exportFileName(date: Date = new Date()): string {
  return `lessive-correspondances-${formatDateStamp(date)}.json`;
}

/** Vrai si la session n'a aucune entité (rien à perdre, rien à exporter). */
export function isSessionEmpty(session: Session | null): boolean {
  return session === null || session.entities().length === 0;
}

export interface ExportedFile {
  fileName: string;
  /** Fichier JSON chiffré : seule forme sous laquelle la table quitte la mémoire (R5). */
  content: string;
}

/** Sérialise puis chiffre la session (PBKDF2 + AES-GCM par le moteur). */
export async function exportSession(
  session: Session,
  passphrase: string,
  now: Date = new Date(),
): Promise<ExportedFile> {
  const snapshot = serializeSession(session);
  const content = await encryptSnapshot(snapshot, passphrase);
  return { fileName: exportFileName(now), content };
}

/** Déchiffre, valide et reconstruit une session depuis le contenu d'un fichier d'export. */
export async function importSession(fileContent: string, passphrase: string): Promise<Session> {
  return restoreSession(await decryptSnapshot(fileContent, passphrase));
}

/**
 * Message d'erreur clair pour l'utilisateur. Les erreurs du moteur sont en français et
 * sans donnée par contrat ; toute autre erreur reçoit un message générique.
 */
export function describeSessionError(error: unknown): string {
  if (error instanceof CryptoFormatError) {
    switch (error.code) {
      case "authentication-failed":
        return "Phrase de passe incorrecte ou fichier altéré.";
      case "unsupported-format":
        return "Format non pris en charge : ce fichier n'a pas été produit par cette version de Lessive.";
      case "malformed-file":
        return "Fichier illisible ou incomplet : ce n'est pas un fichier de correspondances Lessive.";
      default:
        return error.message;
    }
  }
  if (error instanceof SnapshotError) {
    return "Le fichier déchiffré ne contient pas une session valide.";
  }
  return "Opération impossible.";
}
