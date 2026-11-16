/**
 * Validation et assemblage d'un pack à partir de données JSON déjà lues.
 *
 * `parsePack` ne lève jamais d'exception pour un pack invalide : il renvoie
 * `{ ok: false, errors }` avec tous les problèmes trouvés (messages en
 * français, indiquant pack, fichier, règle et champ). Il ne touche ni au
 * réseau ni au disque : l'appelant fournit les contenus (R3).
 */
import * as z from "zod";
import type { Pack, PackManifest, Rule } from "../types/index.ts";
import { PackManifestSchema, RuleFileSchema, RuleSchema } from "./schema.ts";
import { isValidSemver, satisfiesMinimum } from "./semver.ts";

export type PackParseResult = { ok: true; pack: Pack } | { ok: false; errors: string[] };

const zodOptions = { error: z.locales.fr().localeError };

function pathToString(path: readonly PropertyKey[]): string {
  return path
    .map((p) => (typeof p === "number" ? `[${p}]` : String(p)))
    .join(".")
    .replace(/\.\[/g, "[");
}

function where(parts: { pack: string; file?: string; rule?: string; field?: string }): string {
  const out = [`pack « ${parts.pack} »`];
  if (parts.file !== undefined) out.push(`fichier « ${parts.file} »`);
  if (parts.rule !== undefined) out.push(`règle « ${parts.rule} »`);
  if (parts.field) out.push(`champ « ${parts.field} »`);
  return out.join(", ");
}

function issueText(issue: z.core.$ZodIssue): string {
  if (issue.code === "unrecognized_keys") {
    return `Champ(s) inconnu(s) refusé(s) : ${issue.keys.join(", ")}.`;
  }
  return issue.message;
}

/** Extrait l'identifiant lisible d'une règle brute pour les messages. */
function ruleLabel(raw: unknown, index: number): string {
  if (typeof raw === "object" && raw !== null && "id" in raw && typeof raw.id === "string") {
    return raw.id;
  }
  return `#${index}`;
}

export function parsePack(
  manifestJson: unknown,
  ruleFiles: Record<string, unknown>,
  engineVersion: string,
): PackParseResult {
  const errors: string[] = [];

  let packLabel = "?";
  if (typeof manifestJson === "object" && manifestJson !== null && "id" in manifestJson) {
    if (typeof manifestJson.id === "string") packLabel = manifestJson.id;
  }

  const m = PackManifestSchema.safeParse(manifestJson, zodOptions);
  if (!m.success) {
    for (const issue of m.error.issues) {
      errors.push(
        `${where({ pack: packLabel, file: "manifest.json", field: pathToString(issue.path) })} : ${issueText(issue)}`,
      );
    }
    return { ok: false, errors };
  }
  const manifest: PackManifest = m.data;

  if (!isValidSemver(engineVersion)) {
    errors.push(
      `${where({ pack: manifest.id })} : version du moteur invalide (« ${engineVersion} »).`,
    );
  } else if (!satisfiesMinimum(engineVersion, manifest.engineVersion)) {
    errors.push(
      `${where({ pack: manifest.id, file: "manifest.json", field: "engineVersion" })} : le pack exige le moteur ${manifest.engineVersion} au minimum, version actuelle ${engineVersion}.`,
    );
  }

  const rules: Rule[] = [];
  const seenIds = new Map<string, string>(); // id de règle -> fichier
  for (const file of manifest.rules) {
    if (!Object.hasOwn(ruleFiles, file)) {
      errors.push(
        `${where({ pack: manifest.id, file })} : fichier de règles listé dans le manifeste mais non fourni.`,
      );
      continue;
    }
    const f = RuleFileSchema.safeParse(ruleFiles[file], zodOptions);
    if (!f.success) {
      for (const issue of f.error.issues) {
        errors.push(
          `${where({ pack: manifest.id, file, field: pathToString(issue.path) })} : ${issueText(issue)}`,
        );
      }
      continue;
    }
    f.data.rules.forEach((raw, index) => {
      const label = ruleLabel(raw, index);
      const r = RuleSchema.safeParse(raw, zodOptions);
      if (!r.success) {
        for (const issue of r.error.issues) {
          errors.push(
            `${where({ pack: manifest.id, file, rule: label, field: pathToString(issue.path) })} : ${issueText(issue)}`,
          );
        }
        return;
      }
      const previous = seenIds.get(r.data.id);
      if (previous !== undefined) {
        errors.push(
          `${where({ pack: manifest.id, file, rule: r.data.id, field: "id" })} : identifiant de règle déjà utilisé dans ce pack (fichier « ${previous} »).`,
        );
        return;
      }
      seenIds.set(r.data.id, file);
      rules.push(r.data);
    });
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, pack: { manifest, rules } };
}
