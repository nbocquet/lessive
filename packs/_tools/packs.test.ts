/**
 * Banc d'essai commun à tous les packs livrés.
 *
 * 1. Chaque pack se charge et passe le schéma.
 * 2. ReDoS, en deux contrôles :
 *    a. statique : le motif ANCRÉ (^(?:motif)) doit passer redos-detector. On ancre parce que,
 *       sans ancre, l'outil compte les redémarrages du balayage et rejette des motifs bornés
 *       inoffensifs ; l'ancre isole le vrai danger, le retour arrière explosif dans une tentative.
 *       Exceptions relues et justifiées : packs/_tools/redos-exceptions.json ;
 *    b. dynamique, pour TOUS les motifs : balayage complet d'entrées adverses de 20 000
 *       caractères (répétitions des littéraux du motif et de séquences usuelles) en moins de
 *       ADVERSARIAL_BUDGET_MS chacune. Ce contrôle couvre aussi le coût des redémarrages.
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

const ADVERSARIAL_LENGTH = 20_000;
const ADVERSARIAL_BUDGET_MS = 150;

const exceptions = new Set(
  (
    JSON.parse(readFileSync(new URL("./redos-exceptions.json", import.meta.url), "utf8")) as {
      exceptions: Array<{ rule: string }>;
    }
  ).exceptions.map((e) => e.rule),
);

/** Graines adverses : séquences usuelles + littéraux et préfixes présents dans le motif. */
function adversarialSeeds(pattern: string): string[] {
  const seeds = new Set(["a", "A", "0", " ", ".", "-", "_", ":", "a.", "0.", "a-", "0 ", "aA0"]);
  const literals = pattern.replace(/\\[dDwWsSbBpPkuxc]|\\./g, "").replace(/[[\](){}?*+|^$]/g, "");
  for (const ch of literals) seeds.add(ch);
  const runs = pattern.match(/(?:[A-Za-z0-9_@:=/-]|\\[.-]){2,}/g) ?? [];
  for (const run of runs) seeds.add(run.replace(/\\/g, ""));
  return [...seeds];
}

function scanDuration(re: RegExp, input: string): number {
  const t0 = performance.now();
  re.lastIndex = 0;
  let guard = 0;
  for (let m = re.exec(input); m !== null && guard < 1_000_000; m = re.exec(input), guard++) {
    if (m[0].length === 0) re.lastIndex++;
  }
  return performance.now() - t0;
}

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
        const globalId = `${pack.manifest.id}/${rule.id}`;
        const flags = rule.flags ?? "";
        const staticSafe =
          exceptions.has(globalId) ||
          isSafePattern(`^(?:${rule.pattern})`, {
            caseInsensitive: flags.includes("i"),
            unicode: flags.includes("u"),
            dotAll: flags.includes("s"),
            multiLine: flags.includes("m"),
          }).safe;
        it(`motif ${rule.id} : contrôle statique ReDoS (ancré)`, () => {
          expect(staticSafe, `motif ${globalId} potentiellement catastrophique`).toBe(true);
        });
        // Le test de durée n'est lancé que si le contrôle statique passe : un motif réellement
        // exponentiel bloquerait le processus au lieu d'échouer proprement.
        it.skipIf(!staticSafe)(`motif ${rule.id} : durée sur entrées adverses`, () => {
          const re = new RegExp(rule.pattern, `${flags}g`);
          for (const seed of adversarialSeeds(rule.pattern)) {
            const input = seed.repeat(Math.ceil(ADVERSARIAL_LENGTH / seed.length)) + "!";
            const ms = scanDuration(re, input);
            expect(
              ms,
              `motif ${globalId} lent (${ms.toFixed(0)} ms) sur la graine ${JSON.stringify(seed)}`,
            ).toBeLessThan(ADVERSARIAL_BUDGET_MS);
          }
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
