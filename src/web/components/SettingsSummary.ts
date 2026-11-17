/**
 * Résumé des packs et règles pour l'écran des réglages (T5.7). Logique pure.
 *
 * Le résumé ne reprend ni les motifs ni les termes des dictionnaires, et ne lit
 * jamais le texte de l'utilisateur : il décrit uniquement la configuration livrée
 * et l'état d'activation.
 */
import type { PackRegistry, Rule } from "../../core/index.ts";

export interface ActivationState {
  disabledPackIds: readonly string[];
  /** Surcharges par identifiant global `<pack>/<règle>`. */
  ruleOverrides: Readonly<Record<string, boolean>>;
}

export interface RuleSummary {
  /** Identifiant global `<pack>/<règle>`. */
  globalId: string;
  id: string;
  category: string;
  kind: Rule["kind"];
  description: string;
  score: number;
  validator: string | null;
  contextRequired: boolean;
  enabled: boolean;
}

export interface PackSummary {
  id: string;
  name: string;
  version: string;
  description: string;
  enabled: boolean;
  ruleCount: number;
  activeRuleCount: number;
  rules: RuleSummary[];
}

export function summarizePacks(registry: PackRegistry, state: ActivationState): PackSummary[] {
  return registry.orderedPacks().map((pack) => {
    const packId = pack.manifest.id;
    const rules = pack.rules.map<RuleSummary>((rule) => {
      const globalId = `${packId}/${rule.id}`;
      return {
        globalId,
        id: rule.id,
        category: rule.entityType,
        kind: rule.kind,
        description: rule.description ?? "",
        score: rule.score,
        validator: rule.kind === "pattern" ? (rule.validator ?? null) : null,
        contextRequired: rule.context?.required === true,
        enabled: state.ruleOverrides[globalId] ?? rule.enabled ?? true,
      };
    });
    const enabled = !state.disabledPackIds.includes(packId);
    return {
      id: packId,
      name: pack.manifest.name,
      version: pack.manifest.version,
      description: pack.manifest.description ?? "",
      enabled,
      ruleCount: rules.length,
      activeRuleCount: enabled ? rules.filter((r) => r.enabled).length : 0,
      rules,
    };
  });
}

/** Formate un score de seuil (virgule décimale, deux décimales). */
export function formatScore(value: number): string {
  return value.toFixed(2).replace(".", ",");
}
