/**
 * Registre des packs : enregistrement, dépendances, activation et règles
 * actives dans un ordre déterministe.
 *
 * Activation : un pack est actif par défaut ; une règle est active selon son
 * champ `enabled` (vrai si absent), sauf surcharge explicite. Désactiver un
 * pack n'agit pas en cascade sur ses dépendants ni sur ses dépendances.
 * Une règle n'est retournée que si son pack ET elle-même sont actifs.
 */
import type { Pack, Rule } from "../types/index.ts";

export interface ActiveRule {
  /** Identifiant global `<packId>/<ruleId>`. */
  globalId: string;
  packId: string;
  rule: Rule;
}

export class RegistryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RegistryError";
  }
}

export class PackRegistry {
  private readonly packs = new Map<string, Pack>();
  private readonly packEnabled = new Map<string, boolean>();
  private readonly ruleOverrides = new Map<string, boolean>();

  /** Enregistre un pack ; refuse un identifiant déjà présent. Les dépendances sont vérifiées plus tard. */
  register(pack: Pack): void {
    const id = pack.manifest.id;
    if (this.packs.has(id)) {
      throw new RegistryError(`Pack « ${id} » déjà enregistré : identifiant en double.`);
    }
    this.packs.set(id, pack);
  }

  has(packId: string): boolean {
    return this.packs.has(packId);
  }

  get(packId: string): Pack | undefined {
    return this.packs.get(packId);
  }

  /** Packs enregistrés, triés par id. */
  list(): Pack[] {
    return [...this.packs.keys()].sort(compareStrings).map((id) => this.packs.get(id) as Pack);
  }

  /** Liste des problèmes de dépendances (absentes, cycles) ; vide si tout va bien. */
  checkDependencies(): string[] {
    return this.analyze().errors;
  }

  /** Packs triés : dépendances d'abord, puis id. Lève `RegistryError` si les dépendances sont invalides. */
  orderedPacks(): Pack[] {
    const { errors, order } = this.analyze();
    if (errors.length > 0) throw new RegistryError(errors.join("\n"));
    return order.map((id) => this.packs.get(id) as Pack);
  }

  isPackEnabled(packId: string): boolean {
    this.requirePack(packId);
    return this.packEnabled.get(packId) ?? true;
  }

  setPackEnabled(packId: string, enabled: boolean): void {
    this.requirePack(packId);
    this.packEnabled.set(packId, enabled);
  }

  isRuleEnabled(packId: string, ruleId: string): boolean {
    const rule = this.requireRule(packId, ruleId);
    return this.ruleOverrides.get(`${packId}/${ruleId}`) ?? rule.enabled ?? true;
  }

  setRuleEnabled(packId: string, ruleId: string, enabled: boolean): void {
    this.requireRule(packId, ruleId);
    this.ruleOverrides.set(`${packId}/${ruleId}`, enabled);
  }

  /** Règles actives, packs dans l'ordre des dépendances puis id, règles dans l'ordre du fichier. */
  activeRules(): ActiveRule[] {
    const out: ActiveRule[] = [];
    for (const pack of this.orderedPacks()) {
      const packId = pack.manifest.id;
      if (!(this.packEnabled.get(packId) ?? true)) continue;
      for (const rule of pack.rules) {
        if (this.isRuleEnabled(packId, rule.id)) {
          out.push({ globalId: `${packId}/${rule.id}`, packId, rule });
        }
      }
    }
    return out;
  }

  private requirePack(packId: string): Pack {
    const pack = this.packs.get(packId);
    if (!pack) throw new RegistryError(`Pack « ${packId} » inconnu.`);
    return pack;
  }

  private requireRule(packId: string, ruleId: string): Rule {
    const rule = this.requirePack(packId).rules.find((r) => r.id === ruleId);
    if (!rule) throw new RegistryError(`Règle « ${packId}/${ruleId} » inconnue.`);
    return rule;
  }

  private analyze(): { errors: string[]; order: string[] } {
    const errors: string[] = [];
    const ids = [...this.packs.keys()].sort(compareStrings);
    const deps = new Map<string, string[]>();
    for (const id of ids) {
      const wanted = [...((this.packs.get(id) as Pack).manifest.dependencies ?? [])].sort(
        compareStrings,
      );
      for (const d of wanted) {
        if (!this.packs.has(d)) {
          errors.push(`Pack « ${id} » : dépendance « ${d} » absente du registre.`);
        }
      }
      deps.set(
        id,
        wanted.filter((d) => this.packs.has(d)),
      );
    }

    // Tri topologique déterministe : à chaque pas, le plus petit id prêt.
    const order: string[] = [];
    const placed = new Set<string>();
    let remaining = ids;
    while (remaining.length > 0) {
      const next = remaining.find((id) => (deps.get(id) as string[]).every((d) => placed.has(d)));
      if (next === undefined) break;
      order.push(next);
      placed.add(next);
      remaining = remaining.filter((id) => id !== next);
    }
    if (remaining.length > 0) {
      errors.push(`Cycle de dépendances entre packs : ${findCycle(remaining, deps).join(" -> ")}.`);
    }
    return { errors, order };
  }
}

function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Trouve un cycle parmi des packs qui n'ont pu être ordonnés (tous ont une dépendance restante). */
function findCycle(remaining: string[], deps: Map<string, string[]>): string[] {
  const inRemaining = new Set(remaining);
  const path: string[] = [];
  const onPath = new Set<string>();
  let current = remaining[0] as string;
  while (!onPath.has(current)) {
    onPath.add(current);
    path.push(current);
    const next = (deps.get(current) as string[]).find((d) => inRemaining.has(d));
    if (next === undefined) break;
    current = next;
  }
  return [...path.slice(path.indexOf(current)), current];
}
