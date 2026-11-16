import { describe, expect, it } from "vitest";
import manifestJson from "./fixtures/pack-exemple/manifest.json";
import patternsJson from "./fixtures/pack-exemple/rules/patterns.json";
import dictionariesJson from "./fixtures/pack-exemple/rules/dictionaries.json";
import { PackRegistry, RegistryError, compareSemver, isValidSemver, parsePack } from "./index.ts";
import type { PackParseResult } from "./index.ts";
import type { Pack } from "../types/index.ts";

const ENGINE = "0.1.0";
const files = () => ({
  "rules/patterns.json": structuredClone(patternsJson) as unknown,
  "rules/dictionaries.json": structuredClone(dictionariesJson) as unknown,
});
const manifest = () => structuredClone(manifestJson) as Record<string, unknown>;

function errorsOf(r: PackParseResult): string[] {
  if (r.ok) throw new Error("erreur attendue");
  return r.errors;
}
function okPack(r: PackParseResult): Pack {
  if (!r.ok) throw new Error(r.errors.join("\n"));
  return r.pack;
}

/** Pack minimal avec une règle de dictionnaire. */
function mini(id: string, deps?: string[], rules = ["a"]): Pack {
  return {
    manifest: {
      id,
      version: "1.0.0",
      engineVersion: "0.1.0",
      type: "domain",
      name: id,
      ...(deps ? { dependencies: deps } : {}),
      rules: ["r.json"],
    },
    rules: rules.map((r) => ({
      kind: "dictionary" as const,
      id: r,
      entityType: "PERSON" as const,
      score: 0.5,
      terms: ["x"],
    })),
  };
}

function oneRule(rule: Record<string, unknown>) {
  return parsePack({ ...manifest(), rules: ["r.json"] }, { "r.json": { rules: [rule] } }, ENGINE);
}
const validPattern = {
  kind: "pattern",
  id: "p1",
  entityType: "EMAIL",
  score: 0.5,
  pattern: "a+",
};

describe("parsePack", () => {
  it("accepte le pack d'exemple", () => {
    const pack = okPack(parsePack(manifest(), files(), ENGINE));
    expect(pack.manifest.id).toBe("exemple-synthetique");
    expect(pack.rules.map((r) => r.id)).toEqual(["numero-test", "ref_dossier", "prenoms-fictifs"]);
  });

  it("accepte un pack minimal sans règle", () => {
    const m = { ...manifest(), rules: [] };
    expect(parsePack(m, {}, ENGINE).ok).toBe(true);
  });

  it("refuse un manifeste invalide, avec le champ nommé", () => {
    const errs = errorsOf(
      parsePack({ ...manifest(), id: "Mauvais_ID", version: "1.0", type: "x" }, files(), ENGINE),
    );
    const text = errs.join("\n");
    expect(text).toContain("pack « Mauvais_ID »");
    expect(text).toContain("fichier « manifest.json »");
    expect(text).toContain("champ « id »");
    expect(text).toContain("champ « version »");
    expect(text).toContain("champ « type »");
    expect(parsePack(null, {}, ENGINE).ok).toBe(false);
  });

  it("refuse un fichier de règles manquant", () => {
    const f = files();
    delete (f as Record<string, unknown>)["rules/dictionaries.json"];
    const errs = errorsOf(parsePack(manifest(), f, ENGINE));
    expect(errs).toHaveLength(1);
    expect(errs[0]).toContain("fichier « rules/dictionaries.json »");
    expect(errs[0]).toContain("non fourni");
  });

  it("refuse un chemin de fichier qui sort du dossier du pack", () => {
    const errs = errorsOf(parsePack({ ...manifest(), rules: ["../x.json"] }, {}, ENGINE));
    expect(errs[0]).toContain("relatif");
  });

  it("refuse un validateur inconnu avec la liste des validateurs", () => {
    const errs = errorsOf(oneRule({ ...validPattern, validator: "eval_js" }));
    expect(errs).toHaveLength(1);
    expect(errs[0]).toContain("règle « p1 »");
    expect(errs[0]).toContain("champ « validator »");
    expect(errs[0]).toContain("Validateur inconnu");
    expect(errs[0]).toContain("luhn");
  });

  it("accepte un validateur connu", () => {
    expect(oneRule({ ...validPattern, validator: "iban_mod97" }).ok).toBe(true);
  });

  it("refuse une regex invalide", () => {
    const errs = errorsOf(oneRule({ ...validPattern, pattern: "(abc" }));
    expect(errs[0]).toContain("champ « pattern »");
    expect(errs[0]).toContain("non compilable");
  });

  it("refuse un motif trop long", () => {
    const errs = errorsOf(oneRule({ ...validPattern, pattern: "a".repeat(2001) }));
    expect(errs.join()).toContain("2000");
  });

  it("refuse un drapeau interdit ou en double", () => {
    expect(errorsOf(oneRule({ ...validPattern, flags: "g" }))[0]).toContain(
      "Drapeau interdit « g »",
    );
    expect(errorsOf(oneRule({ ...validPattern, flags: "y" }))[0]).toContain("champ « flags »");
    expect(errorsOf(oneRule({ ...validPattern, flags: "ii" }))[0]).toContain("en double");
    expect(oneRule({ ...validPattern, flags: "imsu" }).ok).toBe(true);
  });

  it("refuse un champ inconnu (règle, manifeste, fichier)", () => {
    expect(errorsOf(oneRule({ ...validPattern, run: "alert(1)" }))[0]).toContain("inconnu");
    expect(errorsOf(parsePack({ ...manifest(), extra: 1 }, files(), ENGINE))[0]).toContain("extra");
    const f = { ...files(), "rules/patterns.json": { rules: [], autre: 1 } };
    expect(errorsOf(parsePack(manifest(), f, ENGINE))[0]).toContain("autre");
  });

  it("refuse un score hors de [0,1], un type d'entité inconnu et un kind inconnu", () => {
    expect(errorsOf(oneRule({ ...validPattern, score: 1.5 }))[0]).toContain("champ « score »");
    expect(errorsOf(oneRule({ ...validPattern, entityType: "PETS" }))[0]).toContain(
      "Type d'entité inconnu",
    );
    expect(errorsOf(oneRule({ ...validPattern, kind: "script" }))[0]).toContain("kind");
  });

  it("refuse les ids de règle non kebab/snake et les doublons", () => {
    expect(errorsOf(oneRule({ ...validPattern, id: "MonId" }))[0]).toContain("kebab-case");
    expect(oneRule({ ...validPattern, id: "ch-avs" }).ok).toBe(true);
    expect(oneRule({ ...validPattern, id: "ch_avs" }).ok).toBe(true);
    const dup = parsePack(
      { ...manifest(), rules: ["r.json"] },
      { "r.json": { rules: [validPattern, validPattern] } },
      ENGINE,
    );
    expect(errorsOf(dup)[0]).toContain("déjà utilisé");
  });

  it("refuse un dictionnaire vide ou trop gros", () => {
    const base = { kind: "dictionary", id: "d", entityType: "PERSON", score: 0.5 };
    expect(errorsOf(oneRule({ ...base, terms: [] }))[0]).toContain("champ « terms »");
    expect(
      errorsOf(oneRule({ ...base, terms: Array.from({ length: 50_001 }, (_, i) => `t${i}`) }))[0],
    ).toContain("50000");
    expect(oneRule({ ...base, terms: Array.from({ length: 50_000 }, (_, i) => `t${i}`) }).ok).toBe(
      true,
    );
  });

  it("refuse une version moteur incompatible", () => {
    const m = { ...manifest(), engineVersion: "2.0.0" };
    const errs = errorsOf(parsePack(m, files(), ENGINE));
    expect(errs[0]).toContain("champ « engineVersion »");
    expect(errs[0]).toContain("2.0.0");
    expect(parsePack({ ...manifest(), engineVersion: "0.1.0" }, files(), "0.2.0").ok).toBe(true);
  });

  it("n'accepte aucune fonction ni valeur non JSON comme règle", () => {
    const r = oneRule({ ...validPattern, validator: () => true });
    expect(r.ok).toBe(false);
  });
});

describe("semver", () => {
  it("compare à la main", () => {
    expect(compareSemver("1.2.3", "1.2.3")).toBe(0);
    expect(compareSemver("1.2.4", "1.2.3")).toBe(1);
    expect(compareSemver("1.10.0", "1.9.9")).toBe(1);
    expect(compareSemver("0.9.9", "1.0.0")).toBe(-1);
    expect(compareSemver("1.0.0-alpha", "1.0.0")).toBe(-1);
    expect(compareSemver("1.0.0-alpha.2", "1.0.0-alpha.10")).toBe(-1);
    expect(compareSemver("1.0.0-alpha", "1.0.0-alpha.1")).toBe(-1);
    expect(compareSemver("1.0.0+build1", "1.0.0+build2")).toBe(0);
  });
  it("valide le format", () => {
    expect(isValidSemver("1.2.3")).toBe(true);
    expect(isValidSemver("1.2")).toBe(false);
    expect(isValidSemver("01.2.3")).toBe(false);
    expect(() => compareSemver("x", "1.0.0")).toThrow();
  });
});

describe("PackRegistry", () => {
  it("enregistre, liste et refuse un id en double", () => {
    const reg = new PackRegistry();
    reg.register(mini("b"));
    reg.register(mini("a"));
    expect(reg.list().map((p) => p.manifest.id)).toEqual(["a", "b"]);
    expect(() => reg.register(mini("a"))).toThrow(RegistryError);
    expect(() => reg.register(mini("a"))).toThrow(/en double/);
  });

  it("signale une dépendance absente", () => {
    const reg = new PackRegistry();
    reg.register(mini("a", ["absent"]));
    expect(reg.checkDependencies()[0]).toContain("« absent » absente");
    expect(() => reg.activeRules()).toThrow(/absente/);
  });

  it("détecte un cycle", () => {
    const reg = new PackRegistry();
    reg.register(mini("a", ["b"]));
    reg.register(mini("b", ["c"]));
    reg.register(mini("c", ["a"]));
    const errs = reg.checkDependencies();
    expect(errs).toHaveLength(1);
    expect(errs[0]).toMatch(/Cycle.*a -> b -> c -> a/);
  });

  it("ordonne par dépendances puis id, de façon déterministe", () => {
    const build = (order: string[]) => {
      const reg = new PackRegistry();
      const all: Record<string, Pack> = {
        z: mini("z"),
        a: mini("a", ["z"]),
        m: mini("m"),
        b: mini("b", ["a"], ["r1", "r2"]),
      };
      for (const id of order) reg.register(all[id] as Pack);
      return reg.activeRules().map((r) => r.globalId);
    };
    const expected = ["m/a", "z/a", "a/a", "b/r1", "b/r2"];
    expect(build(["z", "a", "m", "b"])).toEqual(expected);
    expect(build(["b", "m", "a", "z"])).toEqual(expected);
  });

  it("active et désactive packs et règles", () => {
    const reg = new PackRegistry();
    reg.register(okPack(parsePack(manifest(), files(), ENGINE)));
    const ids = () => reg.activeRules().map((r) => r.globalId);
    // ref_dossier est désactivée par défaut (enabled: false).
    expect(ids()).toEqual([
      "exemple-synthetique/numero-test",
      "exemple-synthetique/prenoms-fictifs",
    ]);
    expect(reg.isRuleEnabled("exemple-synthetique", "ref_dossier")).toBe(false);

    reg.setRuleEnabled("exemple-synthetique", "ref_dossier", true);
    reg.setRuleEnabled("exemple-synthetique", "numero-test", false);
    expect(ids()).toEqual([
      "exemple-synthetique/ref_dossier",
      "exemple-synthetique/prenoms-fictifs",
    ]);

    reg.setPackEnabled("exemple-synthetique", false);
    expect(reg.isPackEnabled("exemple-synthetique")).toBe(false);
    expect(ids()).toEqual([]);
    reg.setPackEnabled("exemple-synthetique", true);
    expect(ids()).toHaveLength(2);
  });

  it("refuse d'activer un pack ou une règle inconnus", () => {
    const reg = new PackRegistry();
    reg.register(mini("a"));
    expect(() => reg.setPackEnabled("x", true)).toThrow(/inconnu/);
    expect(() => reg.setRuleEnabled("a", "nope", true)).toThrow(/inconnue/);
  });
});
