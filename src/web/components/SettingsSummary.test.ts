import { describe, expect, it } from "vitest";
import { AppState } from "../state.svelte.ts";
import { formatScore, summarizePacks } from "./SettingsSummary.ts";

const SENTINEL = "TEXTE-UTILISATEUR-SYNTHETIQUE-4711";
const ALLOWED_RULE_KEYS = [
  "globalId",
  "id",
  "category",
  "kind",
  "description",
  "score",
  "validator",
  "contextRequired",
  "enabled",
].sort();

function setup() {
  const app = new AppState();
  return { app, summary: () => summarizePacks(app.registry, app) };
}

describe("summarizePacks", () => {
  it("décrit les packs livrés avec leurs règles", () => {
    const { summary } = setup();
    const packs = summary();
    expect(packs.length).toBeGreaterThan(0);
    for (const p of packs) {
      expect(p.name).not.toBe("");
      expect(p.version).toMatch(/^\d+\.\d+\.\d+/);
      expect(p.ruleCount).toBe(p.rules.length);
      expect(p.enabled).toBe(true);
    }
    const all = packs.flatMap((p) => p.rules);
    expect(all.some((r) => r.validator !== null)).toBe(true);
    expect(all.some((r) => r.contextRequired)).toBe(true);
    for (const r of all) {
      expect(r.score).toBeGreaterThan(0);
      expect(r.score).toBeLessThanOrEqual(1);
    }
  });

  it("reflète l'activation des packs et des règles", () => {
    const { app, summary } = setup();
    const [first] = summary();
    if (!first) throw new Error("aucun pack");
    const rule = first.rules[0];
    if (!rule) throw new Error("aucune règle");
    app.setRuleEnabled(rule.globalId, false);
    const afterRule = summary()[0];
    expect(afterRule?.rules[0]?.enabled).toBe(false);
    expect(afterRule?.activeRuleCount).toBe(first.activeRuleCount - 1);
    app.setPackEnabled(first.id, false);
    const afterPack = summary()[0];
    expect(afterPack?.enabled).toBe(false);
    expect(afterPack?.activeRuleCount).toBe(0);
    app.resetRules();
    expect(summary()[0]).toEqual(first);
  });

  it("l'ensemble des règles actives correspond à activeRuleIds", () => {
    const { app, summary } = setup();
    const ids = summary()
      .filter((p) => p.enabled)
      .flatMap((p) => p.rules.filter((r) => r.enabled).map((r) => r.globalId));
    expect(ids).toEqual(app.activeRuleIds);
  });

  it("ne contient aucune donnée de texte utilisateur ni motif ou terme de règle", () => {
    const { app, summary } = setup();
    app.setText(`Courriel ${SENTINEL} et suite.`);
    app.setLlmResponse(SENTINEL);
    const packs = summary();
    expect(JSON.stringify(packs)).not.toContain(SENTINEL);
    for (const rule of packs.flatMap((p) => p.rules)) {
      expect(Object.keys(rule).sort()).toEqual(ALLOWED_RULE_KEYS);
    }
    expect(JSON.stringify(packs)).not.toMatch(/"(pattern|terms|flags)":/);
  });
});

describe("formatScore", () => {
  it("utilise la virgule décimale", () => {
    expect(formatScore(0.5)).toBe("0,50");
    expect(formatScore(0.35)).toBe("0,35");
  });
});
