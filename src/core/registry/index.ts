/** API publique du registre de packs (T1.5). */
export {
  ALLOWED_FLAGS,
  ContextConfigSchema,
  DictionaryRuleSchema,
  MAX_PATTERN_LENGTH,
  MAX_TERMS,
  PackManifestSchema,
  PatternRuleSchema,
  RuleFileSchema,
  RuleSchema,
} from "./schema.ts";
export { parsePack } from "./parse.ts";
export type { PackParseResult } from "./parse.ts";
export { PackRegistry, RegistryError } from "./registry.ts";
export type { ActiveRule } from "./registry.ts";
export { compareSemver, isValidSemver, parseSemver, satisfiesMinimum } from "./semver.ts";
