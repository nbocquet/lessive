#!/usr/bin/env node
// Évaluation NER locale (spike S1). Aucun accès réseau : Transformers.js est configuré
// avec allowRemoteModels = false et lit uniquement ../../models.
//
// Usage :
//   node eval.mjs                         tous les modèles trouvés dans models/
//   node eval.mjs org/nom [org/nom2 ...]  modèles précis (identifiant relatif à models/)
//   options : --models-dir <dossier>  --dtype <q8|fp32|int8|uint8|fp16>  --chunk <n>  --runs <n>
import { existsSync, readdirSync, readFileSync, statSync, mkdirSync, writeFileSync } from "node:fs";
import { cpus } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  predictText,
  scoreRows,
  mean,
  percentile,
  buildLongText,
  evaluateCriteria,
  renderReport,
} from "./lib.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..", "..");

// --- arguments ----------------------------------------------------------------

function parseArgs(argv) {
  const opts = { models: [], modelsDir: join(root, "models"), dtype: null, chunk: 1000, runs: 3 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--models-dir") opts.modelsDir = resolve(argv[++i]);
    else if (a === "--dtype") opts.dtype = argv[++i];
    else if (a === "--chunk") opts.chunk = Number(argv[++i]);
    else if (a === "--runs") opts.runs = Number(argv[++i]);
    else if (a === "-h" || a === "--help") opts.help = true;
    else if (a.startsWith("--")) throw new Error(`Option inconnue : ${a}`);
    else opts.models.push(a);
  }
  return opts;
}

// --- découverte des modèles -----------------------------------------------------

const hasOnnx = (dir) => {
  const onnx = join(dir, "onnx");
  return existsSync(onnx) && readdirSync(onnx).some((f) => f.endsWith(".onnx"));
};
const isModelDir = (dir) => existsSync(join(dir, "config.json")) && hasOnnx(dir);

/** Cherche models/<org>/<nom> (deux niveaux) ; retourne des identifiants "org/nom". */
function discoverModels(modelsDir) {
  if (!existsSync(modelsDir)) return [];
  const found = [];
  for (const org of readdirSync(modelsDir, { withFileTypes: true })) {
    if (!org.isDirectory()) continue;
    const orgDir = join(modelsDir, org.name);
    if (isModelDir(orgDir)) found.push(org.name); // models/<nom> directement
    for (const name of readdirSync(orgDir, { withFileTypes: true })) {
      if (name.isDirectory() && isModelDir(join(orgDir, name.name))) found.push(`${org.name}/${name.name}`);
    }
  }
  return found.sort();
}

function chooseDtype(modelDir, forced) {
  if (forced) return forced;
  const has = (f) => existsSync(join(modelDir, "onnx", f));
  if (has("model_quantized.onnx")) return "q8";
  if (has("model.onnx")) return "fp32";
  if (has("model_int8.onnx")) return "int8";
  if (has("model_uint8.onnx")) return "uint8";
  if (has("model_fp16.onnx")) return "fp16";
  throw new Error("aucun fichier .onnx reconnu dans onnx/");
}

const SUFFIX = { q8: "_quantized", fp32: "", int8: "_int8", uint8: "_uint8", fp16: "_fp16", q4: "_q4", bnb4: "_bnb4", q4f16: "_q4f16" };

function dirSize(dir) {
  let total = 0;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    total += e.isDirectory() ? dirSize(p) : statSync(p).size;
  }
  return total;
}

function modelSizes(modelDir, dtype) {
  const weights = `onnx/model${SUFFIX[dtype] ?? ""}.onnx`;
  const weightsPath = join(modelDir, weights);
  const weightsBytes = existsSync(weightsPath) ? statSync(weightsPath).size : 0;
  let needed = weightsBytes;
  for (const f of readdirSync(modelDir)) {
    const p = join(modelDir, f);
    if (statSync(p).isFile() && /^(config|tokenizer|tokenizer_config|special_tokens_map|vocab|merges|added_tokens|sentencepiece\.bpe)\b/.test(f)) {
      needed += statSync(p).size;
    }
    if (f === "sentencepiece.bpe.model") needed += statSync(p).size;
  }
  return { weightsFile: weights, weightsBytes, neededBytes: needed, totalBytes: dirSize(modelDir) };
}

// --- corpus -----------------------------------------------------------------------

function loadCorpus() {
  const rows = [];
  for (const lang of ["fr", "en"]) {
    const raw = readFileSync(join(root, "corpus", `ner-${lang}.jsonl`), "utf8");
    for (const line of raw.split("\n")) {
      if (!line.trim()) continue;
      const o = JSON.parse(line);
      rows.push({ ...o, lang, tag: o.id.split("-").slice(2).join("-") });
    }
  }
  return rows;
}

// --- évaluation d'un modèle ----------------------------------------------------------

async function evaluateModel(modelId, opts, tf) {
  const modelDir = join(opts.modelsDir, ...modelId.split("/"));
  if (!isModelDir(modelDir)) {
    throw new Error(`modèle incomplet dans ${modelDir} (config.json et onnx/*.onnx requis, voir README)`);
  }
  const dtype = chooseDtype(modelDir, opts.dtype);
  const size = modelSizes(modelDir, dtype);
  const rows = loadCorpus();

  const rssBefore = process.memoryUsage().rss;
  let rssPeak = rssBefore;
  const sample = () => {
    rssPeak = Math.max(rssPeak, process.memoryUsage().rss);
  };

  const t0 = performance.now();
  const pipe = await tf.pipeline("token-classification", modelId, { dtype });
  const loadMs = performance.now() - t0;
  const rssAfterLoad = process.memoryUsage().rss;
  rssPeak = Math.max(rssPeak, rssAfterLoad);

  const classify = (text) => pipe(text, { aggregation_strategy: "simple" });
  await classify("Échauffement : Marie Dupont habite à Lausanne."); // hors mesure

  // Phrases, une par une.
  const predsById = new Map();
  const times = [];
  const recon = { native: 0, search: 0, approx: 0, unlocated: 0, ignored: 0 };
  for (const row of rows) {
    const s = performance.now();
    const r = await predictText(row.text, classify, { chunkSize: opts.chunk });
    times.push(performance.now() - s);
    sample();
    predsById.set(row.id, r.spans);
    for (const k of ["native", "search", "approx"]) recon[k] += r.sources[k];
    recon.unlocated += r.unlocated;
    recon.ignored += r.ignored;
  }

  // Texte long (≈ 5000 caractères, français), plusieurs essais.
  const frTexts = rows.filter((r) => r.lang === "fr").map((r) => r.text);
  const longText = buildLongText(frTexts, 5000);
  const longTimes = [];
  let longChunks = 0;
  for (let i = 0; i < opts.runs; i++) {
    const s = performance.now();
    const r = await predictText(longText, classify, { chunkSize: opts.chunk });
    longTimes.push(performance.now() - s);
    longChunks = Math.ceil(longText.length / opts.chunk);
    sample();
    void r;
  }
  if (typeof pipe.dispose === "function") await pipe.dispose();

  const langs = ["fr", "en"];
  const byLang = {};
  const byTag = {};
  for (const lang of langs) {
    const subset = rows.filter((r) => r.lang === lang);
    byLang[lang] = scoreRows(subset, predsById);
    byTag[lang] = {};
    for (const tag of [...new Set(subset.map((r) => r.tag))]) {
      byTag[lang][tag] = scoreRows(subset.filter((r) => r.tag === tag), predsById);
    }
  }
  byLang.all = scoreRows(rows, predsById);

  // Erreurs par phrase : identifiants et bornes seulement, pas de texte.
  const mismatches = rows
    .map((row) => ({ id: row.id, gold: row.entities, pred: (predsById.get(row.id) ?? []).map(({ start, end, type }) => ({ start, end, type })) }))
    .filter((m) => JSON.stringify(m.gold) !== JSON.stringify(m.pred));

  const report = {
    model: modelId,
    date: new Date().toISOString().slice(0, 10),
    dtype,
    env: { transformers: opts.tfVersion ?? "inconnue", node: process.version, cpu: cpus()[0]?.model ?? "?", cores: cpus().length },
    perf: {
      loadMs,
      sentences: rows.length,
      meanSentenceMs: mean(times),
      p95SentenceMs: percentile(times, 95),
      longChars: longText.length,
      longChunks,
      longRuns: opts.runs,
      longMedianMs: percentile(longTimes, 50),
      longMinMs: Math.min(...longTimes),
      rssBefore,
      rssAfterLoad,
      rssPeak,
    },
    size,
    byLang,
    byTag,
    reconstruction: recon,
    mismatches,
  };
  report.criteria = evaluateCriteria({
    neededBytes: size.neededBytes,
    personRecallFr: byLang.fr.overlap.PERSON.recall,
    longMedianMs: report.perf.longMedianMs,
  });
  return report;
}

// --- principal ------------------------------------------------------------------------

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.log("Usage : node eval.mjs [org/nom ...] [--models-dir d] [--dtype q8|fp32|...] [--chunk n] [--runs n]");
    return;
  }
  const ids = opts.models.length > 0 ? opts.models : discoverModels(opts.modelsDir);
  if (ids.length === 0) {
    console.log("Aucun modèle trouvé dans models/, voir README (spikes/ner/README.md).");
    console.log(`Dossier cherché : ${opts.modelsDir}`);
    console.log("Attendu : models/<organisation>/<nom>/{config.json, tokenizer.json, onnx/*.onnx}");
    return;
  }

  // Import différé : sans modèle, on ne charge ni Transformers.js ni onnxruntime.
  const tf = await import("@huggingface/transformers");
  tf.env.allowRemoteModels = false; // R4 : aucun téléchargement
  tf.env.allowLocalModels = true;
  tf.env.localModelPath = opts.modelsDir + sep;
  tf.env.useFSCache = false;
  try {
    opts.tfVersion = JSON.parse(
      readFileSync(join(here, "node_modules", "@huggingface", "transformers", "package.json"), "utf8"),
    ).version;
  } catch {
    opts.tfVersion = "inconnue";
  }

  mkdirSync(join(here, "results"), { recursive: true });
  let failures = 0;
  for (const id of ids) {
    console.log(`\n=== ${id} ===`);
    try {
      const report = await evaluateModel(id, opts, tf);
      const slug = id.replaceAll("/", "__");
      writeFileSync(join(here, "results", `${slug}.md`), renderReport(report));
      writeFileSync(join(here, "results", `${slug}.json`), JSON.stringify(report, null, 2) + "\n");
      const p = report.byLang.fr.overlap.PERSON;
      console.log(
        `chargement ${report.perf.loadMs.toFixed(0)} ms · 5000 car. ${report.perf.longMedianMs.toFixed(0)} ms · ` +
          `rappel PERSON fr (recouvrement) ${p.recall === null ? "–" : p.recall.toFixed(3)} · ` +
          `taille ${(report.size.neededBytes / 1e6).toFixed(1)} Mo · positions non localisées ${report.reconstruction.unlocated}`,
      );
      console.log(`-> spikes/ner/results/${slug}.md et .json`);
    } catch (e) {
      failures++;
      console.error(`Échec pour ${id} : ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  if (failures > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(`Erreur : ${e instanceof Error ? e.message : String(e)}`);
  process.exitCode = 1;
});
