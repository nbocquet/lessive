/**
 * Banc d'essai commun à tous les packs livrés.
 *
 * 1. Chaque pack se charge et passe le schéma.
 * 2. Aucun motif n'est signalé par le détecteur de ReDoS.
 * 3. Les cas de tests/cases.json de chaque pack passent, TOUS LES PACKS ÉTANT ACTIFS
 *    ensemble (critère AC-05 : Suisse et France activables simultanément).
 *
 * Format de tests/cases.json :
 * {
 *   "cases": [
 *     {
 *       "id": "avs-dans-un-texte-anglais",
 *       "language": "en",                 // "fr" | "en" | absent
 *       "text": "My AHV number is 756.1234.5678.97.",
 *       "expect": [{ "type": "CH_AVS", "value": "756.1234.5678.97" }]
 *     }
 *   ]
 * }
 *
 * Règle : les détections RETENUES produites par les règles de ce pack doivent être
 * exactement `expect` (type + texte), ni plus ni moins. Les détections des autres
 * packs sont ignorées, sauf si elles font disparaître une entité attendue.
 * Un cas négatif s'écrit avec "expect": [].
 */
import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { isSafePattern } from "redos-detector";
import { describe, expect, it } from "vitest";
import { createAnalyzer, PackRegistry, type Language } from "../../src/core/index.ts";
import { bundledPackDirs, loadPackDir } from "./load.ts";

interface Case {
  id: string;
  language?: Language;
  text: string;
  expect: Array<{ type: string; value: string }>;
}

const dirs = bundledPackDirs();
const packs = dirs.map((dir) => ({ dir, pack: loadPackDir(dir) }));
const registry = new PackRegistry();
for (const { pack } of packs) registry.register(pack);
const analyzer = createAnalyzer(registry.activeRules());

describe("packs livrés", () => {
  it("se chargent et ont des dépendances résolues", () => {
    expect(() => registry.activeRules()).not.toThrow();
  });

  for (const { dir, pack } of packs) {
    describe(pack.manifest.id, () => {
      it("a un README et des cas de test", () => {
        expect(existsSync(join(dir, "README.md")), "README.md manquant").toBe(true);
        expect(existsSync(join(dir, "tests", "cases.json")), "tests/cases.json manquant").toBe(
          true,
        );
      });

      for (const rule of pack.rules) {
        if (rule.kind !== "pattern") continue;
        it(`motif ${rule.id} sans risque de ReDoS`, () => {
          const flags = rule.flags ?? "";
          const res = isSafePattern(rule.pattern, {
            caseInsensitive: flags.includes("i"),
            unicode: flags.includes("u"),
            dotAll: flags.includes("s"),
            multiLine: flags.includes("m"),
          });
          expect(res.safe, `motif ${rule.id} potentiellement catastrophique`).toBe(true);
        });
      }

      const casesFile = join(dir, "tests", "cases.json");
      if (!existsSync(casesFile)) return;
      const { cases } = JSON.parse(readFileSync(casesFile, "utf8")) as { cases: Case[] };
      for (const c of cases) {
        it(`cas ${c.id}`, async () => {
          const res = await analyzer.analyze(c.text, c.language ? { language: c.language } : {});
          const mine = res.detections
            .filter((d) => d.packId === pack.manifest.id)
            .map((d) => ({ type: d.entityType, value: c.text.slice(d.start, d.end) }));
          const sortKey = (x: { type: string; value: string }) => `${x.type}|${x.value}`;
          expect(mine.map(sortKey).sort(), `pack ${basename(dir)}, cas ${c.id}`).toEqual(
            c.expect.map(sortKey).sort(),
          );
        });
      }
    });
  }
});
