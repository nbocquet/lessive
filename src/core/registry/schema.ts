/**
 * Schémas Zod des packs (R8 : données uniquement, aucun code).
 *
 * Format d'un fichier de règles : un objet `{ "rules": [ ...règles ] }`.
 * Choisi plutôt qu'un tableau nu pour rester extensible sans casser les packs.
 *
 * Tous les objets sont stricts : un champ inconnu est refusé, afin qu'un pack
 * ne puisse pas transporter de données inattendues. Aucun champ ne contient de
 * fonction ni de chaîne évaluée ; les expressions régulières sont seulement
 * compilées pour vérification, jamais exécutées ici.
 */
import * as z from "zod";
import { ENTITY_TYPES, VALIDATOR_NAMES } from "../types/index.ts";
import type {
  ContextConfig,
  DictionaryRule,
  PackManifest,
  PatternRule,
  Rule,
} from "../types/index.ts";
import { SEMVER_PATTERN } from "./semver.ts";

export const MAX_PATTERN_LENGTH = 2000;
export const MAX_TERMS = 50_000;
export const ALLOWED_FLAGS = ["i", "m", "s", "u"] as const;

export const KEBAB_CASE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const SNAKE_CASE = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/;

function describe(input: unknown): string {
  return typeof input === "string" ? `« ${input} »` : "valeur non textuelle";
}

const semver = (label: string) =>
  z.string({ error: `${label} doit être une chaîne.` }).refine((v) => SEMVER_PATTERN.test(v), {
    error: `${label} doit être une version sémantique (ex. 1.2.3).`,
  });

export const PackIdSchema = z
  .string({ error: "L'identifiant du pack doit être une chaîne." })
  .refine((v) => KEBAB_CASE.test(v), {
    error: "L'identifiant du pack doit être en kebab-case (ex. country-ch).",
  });

export const RuleIdSchema = z
  .string({ error: "L'identifiant de règle doit être une chaîne." })
  .refine((v) => KEBAB_CASE.test(v) || SNAKE_CASE.test(v), {
    error: "L'identifiant de règle doit être en kebab-case ou en snake_case (ex. ch-avs, ch_avs).",
  });

export const EntityTypeSchema = z.enum(ENTITY_TYPES, {
  error: (iss) =>
    `Type d'entité inconnu (${describe(iss.input)}). Valeurs autorisées : ${ENTITY_TYPES.join(", ")}.`,
});

export const ValidatorNameSchema = z.enum(VALIDATOR_NAMES, {
  error: (iss) =>
    `Validateur inconnu (${describe(iss.input)}). Les packs ne peuvent référencer que : ${VALIDATOR_NAMES.join(", ")}.`,
});

const LanguageSchema = z.enum(["fr", "en"], {
  error: (iss) => `Langue inconnue (${describe(iss.input)}). Valeurs autorisées : fr, en.`,
});

const wordList = z.array(z.string({ error: "Un mot de contexte doit être une chaîne." }));

export const ContextConfigSchema = z.strictObject({
  words: z.strictObject({
    fr: wordList.optional(),
    en: wordList.optional(),
    any: wordList.optional(),
  }),
  required: z.boolean().optional(),
});

const baseShape = {
  id: RuleIdSchema,
  entityType: EntityTypeSchema,
  score: z
    .number({ error: "Le score doit être un nombre." })
    .min(0, { error: "Le score doit être compris entre 0 et 1." })
    .max(1, { error: "Le score doit être compris entre 0 et 1." }),
  languages: z.union([z.array(LanguageSchema), z.literal("any")]).optional(),
  context: ContextConfigSchema.optional(),
  enabled: z.boolean().optional(),
  description: z.string().optional(),
};

export const PatternRuleSchema = z
  .strictObject({
    ...baseShape,
    kind: z.literal("pattern"),
    pattern: z
      .string({ error: "Le motif doit être une chaîne." })
      .min(1, { error: "Le motif ne doit pas être vide." })
      .max(MAX_PATTERN_LENGTH, {
        error: `Le motif dépasse ${MAX_PATTERN_LENGTH} caractères.`,
      }),
    flags: z.string({ error: "Les drapeaux doivent former une chaîne." }).optional(),
    validator: ValidatorNameSchema.optional(),
  })
  .superRefine((rule, ctx) => {
    let flagsOk = true;
    if (rule.flags !== undefined) {
      const seen = new Set<string>();
      for (const f of rule.flags) {
        if (!(ALLOWED_FLAGS as readonly string[]).includes(f)) {
          flagsOk = false;
          ctx.addIssue({
            code: "custom",
            path: ["flags"],
            message: `Drapeau interdit « ${f} ». Drapeaux autorisés : ${ALLOWED_FLAGS.join(", ")} (le drapeau g est ajouté par le moteur).`,
          });
        } else if (seen.has(f)) {
          flagsOk = false;
          ctx.addIssue({
            code: "custom",
            path: ["flags"],
            message: `Drapeau « ${f} » en double.`,
          });
        }
        seen.add(f);
      }
    }
    if (!flagsOk || rule.pattern.length > MAX_PATTERN_LENGTH) return;
    try {
      // Compilation seule, pour vérifier la syntaxe. Rien n'est exécuté.
      new RegExp(rule.pattern, rule.flags);
    } catch (e) {
      ctx.addIssue({
        code: "custom",
        path: ["pattern"],
        message: `Expression régulière non compilable : ${e instanceof Error ? e.message : String(e)}`,
      });
    }
  });

export const DictionaryRuleSchema = z.strictObject({
  ...baseShape,
  kind: z.literal("dictionary"),
  terms: z
    .array(
      z
        .string({ error: "Un terme doit être une chaîne." })
        .min(1, { error: "Un terme ne doit pas être vide." }),
    )
    .min(1, { error: "La liste de termes ne doit pas être vide." })
    .max(MAX_TERMS, { error: `La liste de termes dépasse ${MAX_TERMS} entrées.` }),
  caseSensitive: z.boolean().optional(),
});

export const RuleSchema = z.discriminatedUnion("kind", [PatternRuleSchema, DictionaryRuleSchema], {
  error: (iss) =>
    iss.code === "invalid_union"
      ? 'Le champ « kind » doit valoir "pattern" ou "dictionary".'
      : undefined,
});

/** Fichier de règles : `{ "rules": [...] }`. */
export const RuleFileSchema = z.strictObject({
  rules: z.array(z.unknown(), { error: "« rules » doit être un tableau de règles." }),
});

const fileName = z
  .string({ error: "Un nom de fichier doit être une chaîne." })
  .min(1, { error: "Un nom de fichier ne doit pas être vide." })
  .refine((f) => !f.startsWith("/") && !f.includes("\\") && !f.split("/").includes(".."), {
    error: "Le chemin du fichier doit être relatif au dossier du pack, sans « .. ».",
  });

export const PackManifestSchema = z
  .strictObject({
    id: PackIdSchema,
    version: semver("La version"),
    engineVersion: semver("La version moteur"),
    type: z.enum(["global", "country", "language", "domain"], {
      error: (iss) =>
        `Type de pack inconnu (${describe(iss.input)}). Valeurs autorisées : global, country, language, domain.`,
    }),
    name: z
      .string({ error: "Le nom doit être une chaîne." })
      .min(1, { error: "Le nom ne doit pas être vide." }),
    description: z.string().optional(),
    dependencies: z.array(PackIdSchema).optional(),
    rules: z.array(fileName, { error: "« rules » doit être un tableau de noms de fichiers." }),
  })
  .superRefine((m, ctx) => {
    if (m.dependencies) {
      if (new Set(m.dependencies).size !== m.dependencies.length) {
        ctx.addIssue({ code: "custom", path: ["dependencies"], message: "Dépendances en double." });
      }
      if (m.dependencies.includes(m.id)) {
        ctx.addIssue({
          code: "custom",
          path: ["dependencies"],
          message: "Un pack ne peut pas dépendre de lui-même.",
        });
      }
    }
    if (new Set(m.rules).size !== m.rules.length) {
      ctx.addIssue({
        code: "custom",
        path: ["rules"],
        message: "Fichier de règles listé plusieurs fois.",
      });
    }
  });

/** Vérification à la compilation : les types inférés et les interfaces de `types/rules.ts` coïncident. */
type Mutual<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Assert<T extends true> = T;
export type _CompatChecks = [
  Assert<Mutual<z.infer<typeof PatternRuleSchema>, PatternRule>>,
  Assert<Mutual<z.infer<typeof DictionaryRuleSchema>, DictionaryRule>>,
  Assert<Mutual<z.infer<typeof RuleSchema>, Rule>>,
  Assert<Mutual<z.infer<typeof PackManifestSchema>, PackManifest>>,
  Assert<Mutual<z.infer<typeof ContextConfigSchema>, ContextConfig>>,
];
