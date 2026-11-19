/**
 * T3.4 — Évaluation combinée (packs seuls, NER seul, packs + NER) sur `corpus/ner-{fr,en}.jsonl`.
 *
 * Exécution, sans dépendance nouvelle (Node 26, qui exécute le TypeScript directement) :
 *
 *   node scripts/eval/evaluate.ts [--models <dossier>] [--json <fichier>] [--errors <n>]
 *
 * Le corpus n'annote que PERSON, ORGANIZATION et LOCATION : les autres types détectés par les packs
 * (courriel, date…) sont ignorés dans le calcul, ni vrais ni faux positifs. Corpus 100 % synthétique.
 * Deux correspondances : « exacte » (mêmes bornes, même type) et « recouvrement » (même type, intervalles
 * qui se chevauchent), appariées une à une (une détection ne valide qu'une seule entité attendue).
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { cpus } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  PackRegistry,
  createAnalyzer,
  type ActiveRule,
  type AnalysisContext,
  type Analyzer,
  type Detection,
  type Language,
  type NerEngine,
} from "../../src/core/index.ts";
import { TransformersNerEngine } from "../../src/ner/transformers-engine.ts";
import { DEFAULT_NER_MODEL } from "../../src/ner/options.ts";
import { bundledPackDirs, loadPackDir } from "../../packs/_tools/load.ts";

const REPO = fileURLToPath(new URL("../..", import.meta.url));
const TYPES = ["PERSON", "ORGANIZATION", "LOCATION"] as const;
type Type = (typeof TYPES)[number];
type Mode = "exact" | "overlap";
type ConfigName = "packs" | "ner" | "combined";
const CONFIGS: ConfigName[] = ["packs", "ner", "combined"];
const CONFIG_LABEL: Record<ConfigName, string> = {
  packs: "Packs seuls",
  ner: "NER seul",
  combined: "Packs + NER",
};
const LANGS: Language[] = ["fr", "en"];

interface Gold {
  start: number;
  end: number;
  type: Type;
}
interface Sentence {
  id: string;
  /** Catégorie de la phrase : dernier segment de l'identifiant (std, lower, trap…). */
  category: string;
  text: string;
  entities: Gold[];
}
interface Span {
  start: number;
  end: number;
  type: Type;
}
interface Counts {
  tp: number;
  fp: number;
  fn: number;
}
interface Example {
  config: ConfigName;
  lang: Language;
  id: string;
  kind: "FN" | "FP";
  type: Type;
  value: string;
  sentence: string;
}

// ---------- arguments ----------
const argv = process.argv.slice(2);
const arg = (name: string): string | undefined => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};
const jsonOut = arg("--json");
const errorsPerKind = Number(arg("--errors") ?? 0);
const modelsDir = (() => {
  const candidates = [
    arg("--models"),
    join(REPO, "models"),
    "/mnt/user-data/uploads/lessive/models",
  ];
  for (const dir of candidates) {
    if (dir && existsSync(join(dir, DEFAULT_NER_MODEL, "onnx"))) return dir.replace(/\/?$/, "/");
  }
  throw new Error(`Modèle ${DEFAULT_NER_MODEL} introuvable (voir --models ou models/README.md).`);
})();

// ---------- corpus et packs ----------
function readCorpus(lang: Language): Sentence[] {
  return readFileSync(join(REPO, "corpus", `ner-${lang}.jsonl`), "utf8")
    .split("\n")
    .filter((l) => l.trim() !== "")
    .map((l) => {
      const d = JSON.parse(l) as { id: string; text: string; entities: Gold[] };
      return { ...d, category: d.id.split("-").at(-1) ?? "?" };
    });
}

function allActiveRules(): ActiveRule[] {
  const registry = new PackRegistry();
  for (const dir of bundledPackDirs()) registry.register(loadPackDir(dir));
  return registry.orderedPacks().flatMap((pack) =>
    pack.rules.map((rule) => ({
      globalId: `${pack.manifest.id}/${rule.id}`,
      packId: pack.manifest.id,
      rule,
    })),
  );
}

// ---------- appariement ----------
const overlapLen = (a: Span, b: Span) => Math.min(a.end, b.end) - Math.max(a.start, b.start);

/** Appariement un-à-un glouton (recouvrement décroissant). Renvoie les indices appariés. */
function match(gold: Span[], pred: Span[], mode: Mode) {
  const pairs: { g: number; p: number; len: number }[] = [];
  gold.forEach((g, gi) =>
    pred.forEach((p, pi) => {
      if (g.type !== p.type) return;
      const ok = mode === "exact" ? g.start === p.start && g.end === p.end : overlapLen(g, p) > 0;
      if (ok) pairs.push({ g: gi, p: pi, len: overlapLen(g, p) });
    }),
  );
  pairs.sort((a, b) => b.len - a.len);
  const usedG = new Set<number>();
  const usedP = new Set<number>();
  for (const pr of pairs) {
    if (usedG.has(pr.g) || usedP.has(pr.p)) continue;
    usedG.add(pr.g);
    usedP.add(pr.p);
  }
  return { usedG, usedP };
}

const isType = (t: string): t is Type => (TYPES as readonly string[]).includes(t);
const toSpans = (ds: readonly Detection[]): Span[] =>
  ds
    .filter((d) => isType(d.entityType))
    .map((d) => ({ start: d.start, end: d.end, type: d.entityType as Type }));

// ---------- exécution ----------
const key = (c: ConfigName, l: Language, t: Type | "ALL", m: Mode) => `${c}|${l}|${t}|${m}`;
const counts = new Map<string, Counts>();
const bump = (k: string, f: keyof Counts, n = 1) => {
  const c = counts.get(k) ?? { tp: 0, fp: 0, fn: 0 };
  c[f] += n;
  counts.set(k, c);
};
// Rappel PERSON (recouvrement) par catégorie de phrase.
const byCategory = new Map<string, { hit: number; total: number }>();
const examples: Example[] = [];
const timings: Record<string, number> = {};

async function main() {
  const rules = allActiveRules();
  const analyzer: Analyzer = createAnalyzer(rules);
  const engine: NerEngine = new TransformersNerEngine({ localModelPath: modelsDir, device: "cpu" });
  const t0 = performance.now();
  await engine.load();
  timings.loadMs = performance.now() - t0;

  for (const lang of LANGS) {
    const sentences = readCorpus(lang);
    for (const s of sentences) {
      let nextId = 0;
      const ctx: AnalysisContext = { nextId: () => `e${++nextId}`, language: lang };
      const t1 = performance.now();
      const nerOnly = await engine.recognize(s.text, ctx);
      timings.nerMs = (timings.nerMs ?? 0) + performance.now() - t1;
      const packsOnly = (await analyzer.analyze(s.text, { language: lang })).detections;
      const t2 = performance.now();
      const combined = (await analyzer.analyze(s.text, { language: lang, ner: engine })).detections;
      timings.combinedMs = (timings.combinedMs ?? 0) + performance.now() - t2;
      timings.sentences = (timings.sentences ?? 0) + 1;

      const results: Record<ConfigName, Span[]> = {
        packs: toSpans(packsOnly),
        ner: toSpans(nerOnly),
        combined: toSpans(combined),
      };
      for (const config of CONFIGS) {
        const pred = results[config];
        for (const mode of ["exact", "overlap"] as Mode[]) {
          const { usedG, usedP } = match(s.entities, pred, mode);
          s.entities.forEach((g, i) => {
            const hit = usedG.has(i);
            bump(key(config, lang, g.type, mode), hit ? "tp" : "fn");
            bump(key(config, lang, "ALL", mode), hit ? "tp" : "fn");
            if (
              mode === "overlap" &&
              g.type === "PERSON" &&
              (config === "combined" || config === "ner")
            ) {
              const k = `${config}|${lang}|${s.category}`;
              const c = byCategory.get(k) ?? { hit: 0, total: 0 };
              c.total++;
              if (hit) c.hit++;
              byCategory.set(k, c);
            }
            if (!hit && mode === "overlap") {
              examples.push({
                config,
                lang,
                id: s.id,
                kind: "FN",
                type: g.type,
                value: s.text.slice(g.start, g.end),
                sentence: s.text,
              });
            }
          });
          pred.forEach((p, i) => {
            const hit = usedP.has(i);
            if (!hit) {
              bump(key(config, lang, p.type, mode), "fp");
              bump(key(config, lang, "ALL", mode), "fp");
              if (mode === "overlap") {
                examples.push({
                  config,
                  lang,
                  id: s.id,
                  kind: "FP",
                  type: p.type,
                  value: s.text.slice(p.start, p.end),
                  sentence: s.text,
                });
              }
            }
          });
        }
      }
    }
  }
  await engine.dispose();
}

const ratio = (a: number, b: number) => (b === 0 ? NaN : a / b);
const f3 = (x: number) => (Number.isNaN(x) ? "n/a" : x.toFixed(3).replace(".", ","));
function prf(c: Counts) {
  const p = ratio(c.tp, c.tp + c.fp);
  const r = ratio(c.tp, c.tp + c.fn);
  const f = p + r === 0 || Number.isNaN(p) || Number.isNaN(r) ? NaN : (2 * p * r) / (p + r);
  return { p, r, f, support: c.tp + c.fn };
}
function merged(
  final: Map<string, Counts>,
  c: ConfigName,
  langs: Language[],
  t: Type | "ALL",
  m: Mode,
): Counts {
  const sum = { tp: 0, fp: 0, fn: 0 };
  for (const l of langs) {
    const x = final.get(key(c, l, t, m));
    if (x) {
      sum.tp += x.tp;
      sum.fp += x.fp;
      sum.fn += x.fn;
    }
  }
  return sum;
}

function report(final: Map<string, Counts>): string {
  const lines: string[] = [];
  for (const mode of ["overlap", "exact"] as Mode[]) {
    lines.push(`\n### Correspondance ${mode === "overlap" ? "par recouvrement" : "exacte"}\n`);
    lines.push("| Configuration | Langue | Catégorie | Support | Précision | Rappel | F1 |");
    lines.push("|---|---|---|---:|---:|---:|---:|");
    for (const c of CONFIGS) {
      for (const langs of [["fr"], ["en"], ["fr", "en"]] as Language[][]) {
        for (const t of [...TYPES, "ALL" as const]) {
          const m = prf(merged(final, c, langs, t, mode));
          lines.push(
            `| ${CONFIG_LABEL[c]} | ${langs.join("+")} | ${t === "ALL" ? "Toutes" : t} | ${m.support} | ${f3(m.p)} | ${f3(m.r)} | ${f3(m.f)} |`,
          );
        }
      }
    }
  }
  lines.push("\n### Rappel PERSON par catégorie de phrase (recouvrement)\n");
  lines.push("| Catégorie | Langue | NER seul | Packs + NER | Support |");
  lines.push("|---|---|---:|---:|---:|");
  const cats = [...new Set([...byCategory.keys()].map((k) => k.split("|")[2] as string))].sort();
  for (const cat of cats) {
    for (const l of LANGS) {
      const n = byCategory.get(`ner|${l}|${cat}`);
      const cb = byCategory.get(`combined|${l}|${cat}`);
      if (!n || !cb) continue;
      lines.push(
        `| ${cat} | ${l} | ${f3(n.hit / n.total)} | ${f3(cb.hit / cb.total)} | ${n.total} |`,
      );
    }
  }
  return lines.join("\n");
}

await main();
const final = counts;
const out: string[] = [];
out.push(`Modèle : ${DEFAULT_NER_MODEL} (q8, onnxruntime-node, device cpu) — dossier ${modelsDir}`);
out.push(`Node ${process.version} — ${cpus()[0]?.model ?? "CPU inconnu"} (${cpus().length} cœurs)`);
out.push(
  `Chargement du modèle : ${((timings.loadMs ?? 0) / 1000).toFixed(1)} s ; ` +
    `NER seul : ${((timings.nerMs ?? 0) / (timings.sentences ?? 1)).toFixed(0)} ms/phrase ; ` +
    `analyse complète : ${((timings.combinedMs ?? 0) / (timings.sentences ?? 1)).toFixed(0)} ms/phrase (${timings.sentences} phrases)`,
);
out.push(report(final));
if (errorsPerKind > 0) {
  for (const config of ["ner", "combined"] as ConfigName[]) {
    for (const kind of ["FN", "FP"] as const) {
      for (const type of TYPES) {
        const list = examples.filter(
          (e) => e.config === config && e.kind === kind && e.type === type,
        );
        if (list.length === 0) continue;
        out.push(`\n#### ${CONFIG_LABEL[config]} — ${kind} ${type} (${list.length})\n`);
        for (const e of list.slice(0, errorsPerKind)) {
          out.push(`- [${e.id}] « ${e.value} » dans « ${e.sentence} »`);
        }
      }
    }
  }
}
process.stdout.write(out.join("\n") + "\n");
if (jsonOut) {
  writeFileSync(
    jsonOut,
    JSON.stringify(
      {
        counts: Object.fromEntries(final),
        timings,
        byCategory: Object.fromEntries(byCategory),
        examples,
      },
      null,
      2,
    ),
  );
}
