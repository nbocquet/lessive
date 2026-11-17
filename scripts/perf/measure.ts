/**
 * T6.3 — Mesures de performance sous Node, sur des textes synthétiques de taille croissante.
 *
 * Exécution, sans dépendance nouvelle (Node 22), depuis la racine du dépôt :
 *
 *   node --experimental-transform-types --disable-warning=ExperimentalWarning \
 *     scripts/perf/measure.ts [options]
 *
 * (`--experimental-transform-types` et non `--experimental-strip-types` : `src/core` utilise des
 * propriétés de paramètre de constructeur, que le mode « strip » refuse. Ajouter `--expose-gc`
 * avant le script rend les mesures de tas plus nettes ; sans lui, elles restent indicatives.)
 *
 * Options :
 *   --sizes 1000,5000,20000,100000   tailles cibles, en caractères
 *   --runs 5                         répétitions par mesure (3 au plus pour les textes de plus de 50 000 caractères)
 *   --models <dossier>               dossier des modèles NER (défaut : models/, puis /mnt/user-data/uploads/lessive/models/)
 *   --no-ner                         ne mesure pas le NER, même si le modèle est présent
 *   --dist <dossier>                 build à mesurer (défaut : dist/)
 *   --kdf-runs 5                     répétitions de la dérivation de clé
 *   --json <fichier>                 écrit les mesures brutes
 *   --write-texts <dossier>          écrit aussi les textes synthétiques (texte-<taille>.txt), à coller dans
 *                                    l'application pour la mesure dans le navigateur
 *
 * Les textes sont déterministes (graine fixe) : phrases du corpus synthétique `corpus/ner-fr.jsonl`,
 * modèles de phrases avec noms, courriels, IBAN, numéros AVS, téléphones et dates fabriqués
 * (clés de contrôle calculées, jamais de vraies valeurs), et phrases sans donnée personnelle.
 * Ce qui est mesuré : le moteur seul, sous Node. Le navigateur (WASM, worker, rendu) n'est pas
 * mesuré ici : voir `docs/performances.md`.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { cpus, totalmem } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import {
  DEFAULT_ITERATIONS,
  PackRegistry,
  createAnalyzer,
  createSession,
  decryptSnapshot,
  encryptSnapshot,
  reidentify,
  serializeSession,
  transform,
  type ActiveRule,
  type AnalysisContext,
  type AnalysisResult,
  type Detection,
  type NerEngine,
  type TransformPlan,
} from "../../src/core/index.ts";
import { DEFAULT_NER_MODEL } from "../../src/ner/options.ts";
import { TransformersNerEngine } from "../../src/ner/transformers-engine.ts";
import { prepareReidentifyPreview } from "../../src/web/components/ReidPreview.ts";
import { outputSegments, originalSegments } from "../../src/web/components/ResultLogic.ts";
import { buildSegments } from "../../src/web/components/review-segments.ts";
import { bundledPackDirs, loadPackDir } from "../../packs/_tools/load.ts";

const REPO = fileURLToPath(new URL("../..", import.meta.url));

// ---------- arguments ----------
const argv = process.argv.slice(2);
const arg = (name: string): string | undefined => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};
const SIZES = (arg("--sizes") ?? "1000,5000,20000,100000").split(",").map(Number);
const RUNS = Number(arg("--runs") ?? 5);
const KDF_RUNS = Number(arg("--kdf-runs") ?? 5);
const WITH_NER = !argv.includes("--no-ner");
const distDir = arg("--dist") ?? join(REPO, "dist");
const jsonOut = arg("--json");
const textsDir = arg("--write-texts");

function findModelsDir(): string | undefined {
  for (const dir of [
    arg("--models"),
    join(REPO, "models"),
    "/mnt/user-data/uploads/lessive/models",
  ]) {
    if (dir && existsSync(join(dir, DEFAULT_NER_MODEL, "onnx"))) return dir.replace(/\/?$/, "/");
  }
  return undefined;
}

// ---------- utilitaires ----------
const fmt = (n: number, digits = 1): string => n.toFixed(digits).replace(".", ",");
const mb = (bytes: number): string => fmt(bytes / 1024 / 1024, 1);
const kb = (bytes: number): string => fmt(bytes / 1024, 1);

interface Stat {
  median: number;
  min: number;
  max: number;
  runs: number;
}

function stat(values: number[]): Stat {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
  return { median, min: sorted[0]!, max: sorted.at(-1)!, runs: sorted.length };
}

/** Durée d'une fonction, en ms, sur `runs` essais (le premier essai de chauffe n'est pas compté). */
async function timeIt<T>(
  runs: number,
  fn: () => T | Promise<T>,
  warmup = true,
): Promise<{ stat: Stat; last: T }> {
  let last = (warmup ? await fn() : undefined) as T;
  const times: number[] = [];
  for (let i = 0; i < runs; i++) {
    const t0 = performance.now();
    last = await fn();
    times.push(performance.now() - t0);
  }
  return { stat: stat(times), last };
}

const cell = (s: Stat | undefined): string =>
  s ? `${fmt(s.median, s.median < 10 ? 2 : 1)} (${fmt(s.min, 1)}–${fmt(s.max, 1)})` : "n/d";

interface MemSample {
  label: string;
  rssMb: number;
  heapMb: number;
  externalMb: number;
}
const memSamples: MemSample[] = [];
function sampleMemory(label: string): void {
  (globalThis as { gc?: () => void }).gc?.();
  const m = process.memoryUsage();
  memSamples.push({
    label,
    rssMb: m.rss / 1024 / 1024,
    heapMb: m.heapUsed / 1024 / 1024,
    externalMb: (m.external + m.arrayBuffers) / 1024 / 1024,
  });
}

// ---------- génération des textes synthétiques ----------
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST = [
  "Claire",
  "Jean",
  "Marie",
  "Paul",
  "Sophie",
  "Lucas",
  "Camille",
  "Julien",
  "Nadia",
  "Thomas",
  "Élodie",
  "Mathieu",
  "Sarah",
  "Antoine",
  "Léa",
  "Pierre-Alain",
  "Fatima",
  "Olivier",
];
const LAST = [
  "Dupont",
  "Müller",
  "Favre",
  "Keller",
  "Martin",
  "Rochat",
  "Bernard",
  "Morel",
  "Perret",
  "Girard",
  "Lefèvre",
  "Roux",
  "Schneider",
  "Rossi",
  "Chevalier",
  "Dubois",
];
const PLACES = [
  "Genève",
  "Lausanne",
  "Annemasse",
  "Carouge",
  "Annecy",
  "Saint-Julien-en-Genevois",
  "Nyon",
  "Meyrin",
];
const ORGS = [
  "Brasserie du Léman Sàrl",
  "Transports Alpins SA",
  "Atelier Rochat SAS",
  "Fondation Horizon",
];
const MONTHS = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
];

const FILLER = [
  "Le comité s'est réuni pour examiner le budget et les priorités de l'année à venir.",
  "Nous avons convenu de revoir le calendrier des livraisons lors de la prochaine séance.",
  "Le rapport détaille les étapes du projet, les risques identifiés et les mesures de suivi.",
  "Merci de relire le document avant la fin de la semaine et de signaler les points à corriger.",
  "La réunion s'est terminée à l'heure prévue, sans décision particulière sur les achats.",
  "Les résultats du trimestre sont conformes aux prévisions, avec une légère hausse des ventes.",
  "Il reste à valider le plan de formation et à confirmer la salle pour la rencontre annuelle.",
  "The meeting covered the roadmap, the open questions and the next steps for the team.",
  "Please find attached the summary of the discussion and the list of pending actions.",
  "Aucune modification n'est nécessaire pour l'instant ; nous reviendrons vers vous si besoin.",
];

function ascii(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z-]/g, "");
}

function digits(rand: () => number, n: number): string {
  let out = "";
  for (let i = 0; i < n; i++) out += Math.floor(rand() * 10);
  return out;
}

/** IBAN suisse synthétique à clé mod 97 correcte, groupé par 4. */
function makeIban(rand: () => number): string {
  const bban = digits(rand, 17);
  const rearranged = `${bban}122100`; // « CH » = 12 17, puis « 00 »
  let rest = 0;
  for (const ch of rearranged) rest = (rest * 10 + Number(ch)) % 97;
  const check = String(98 - rest).padStart(2, "0");
  return `CH${check}${bban}`.replace(/(.{4})/g, "$1 ").trim();
}

/** Numéro AVS synthétique `756.xxxx.xxxx.xC` à clé EAN-13 correcte. */
function makeAvs(rand: () => number): string {
  const body = `756${digits(rand, 9)}`;
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(body[i]) * (i % 2 === 0 ? 1 : 3);
  const full = `${body}${(10 - (sum % 10)) % 10}`;
  return `${full.slice(0, 3)}.${full.slice(3, 7)}.${full.slice(7, 11)}.${full.slice(11)}`;
}

function generate(targetLength: number, corpus: string[], seed: number): string {
  const rand = mulberry32(seed);
  const pick = <T>(list: readonly T[]): T => list[Math.floor(rand() * list.length)]!;
  const person = () => `${pick(FIRST)} ${pick(LAST)}`;
  const email = () => `${ascii(pick(FIRST))}.${ascii(pick(LAST))}@example.org`;
  const swissPhone = () =>
    `07${pick(["6", "7", "8", "9"])} ${digits(rand, 3)} ${digits(rand, 2)} ${digits(rand, 2)}`;
  const frPhone = () =>
    `06 ${digits(rand, 2)} ${digits(rand, 2)} ${digits(rand, 2)} ${digits(rand, 2)}`;
  const numDate = () =>
    `${String(1 + Math.floor(rand() * 28)).padStart(2, "0")}.${String(1 + Math.floor(rand() * 12)).padStart(2, "0")}.${1950 + Math.floor(rand() * 60)}`;
  const litDate = () =>
    `${1 + Math.floor(rand() * 28)} ${pick(MONTHS)} ${2000 + Math.floor(rand() * 26)}`;

  const templates: Array<() => string> = [
    () => `Contactez ${person()} à ${email()} ou au ${swissPhone()}.`,
    () => `Virement sur l'IBAN ${makeIban(rand)} au nom de ${person()}, ${pick(ORGS)}.`,
    () => `${person()}, né le ${numDate()}, n° AVS ${makeAvs(rand)}, domicilié à ${pick(PLACES)}.`,
    () => `Le dossier de Mme ${pick(LAST)} a été ouvert le ${litDate()} par ${pick(FIRST)}.`,
    () => `Rendez-vous le ${litDate()} à ${pick(PLACES)} avec M. ${pick(LAST)}, tél. ${frPhone()}.`,
    () => `${pick(FIRST)} a écrit à ${email()} pour confirmer la réunion du ${numDate()}.`,
    () => `Bonjour ${pick(FIRST)}, merci pour votre message. Cordialement, ${person()}`,
  ];

  const parts: string[] = [];
  let length = 0;
  let sentences = 0;
  while (length < targetLength + 200) {
    const r = rand();
    const sentence = r < 0.35 ? pick(corpus) : r < 0.65 ? pick(templates)() : pick(FILLER);
    const sep = ++sentences % 5 === 0 ? "\n\n" : " ";
    parts.push(sentence, sep);
    length += sentence.length + sep.length;
  }
  const text = parts.join("");
  if (text.length <= targetLength) return text;
  const cut = text.lastIndexOf(" ", targetLength);
  return text.slice(0, cut > targetLength - 200 ? cut : targetLength).trimEnd();
}

// ---------- packs ----------
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

// ---------- taille du build ----------
interface DistFile {
  path: string;
  bytes: number;
  gzip?: number;
  kind: "js" | "css" | "html" | "ort" | "model" | "other";
}

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
  );
}

function measureDist(dir: string): DistFile[] | undefined {
  if (!existsSync(dir)) return undefined;
  return walk(dir)
    .sort()
    .map((file): DistFile => {
      const path = relative(dir, file);
      const bytes = statSync(file).size;
      const kind: DistFile["kind"] = path.startsWith("models/")
        ? "model"
        : path.startsWith("ort/")
          ? "ort"
          : path.endsWith(".js") || path.endsWith(".mjs")
            ? "js"
            : path.endsWith(".css")
              ? "css"
              : path.endsWith(".html")
                ? "html"
                : "other";
      const compressible =
        kind === "js" || kind === "css" || kind === "html" || path.endsWith(".wasm");
      return {
        path,
        bytes,
        kind,
        ...(compressible ? { gzip: gzipSync(readFileSync(file)).length } : {}),
      };
    });
}

// ---------- mesure ----------
interface SizeResult {
  target: number;
  length: number;
  rulesMs: Stat;
  nerMs?: Stat;
  combinedMs?: Stat;
  detectionsRules: number;
  detectionsCombined?: number;
  byType: Record<string, number>;
  transformMs: Stat;
  reidentifyMs: Stat;
  cloneMs: Stat;
  pageLogicMs: Stat;
  pageReidLogicMs: Stat;
  replacements: number;
}

const result: {
  machine: Record<string, string | number>;
  loadPacksMs: number;
  ruleCount: number;
  nerLoadMs?: number;
  nerModelDir?: string;
  sizes: SizeResult[];
  recognizerBreakdown: Array<{ id: string; ms: number }>;
  recognizerTotalMs: number;
  analyzeTotalMsAtLargest: number;
  kdf: {
    iterations: number;
    rawMs: Stat;
    encryptMs: Stat;
    decryptMs: Stat;
    maxLoopLagMs: number;
    snapshotBytes: number;
    entities: number;
  };
  memory: MemSample[];
  maxRssMb: number;
  dist?: DistFile[];
} = {
  machine: {},
  loadPacksMs: 0,
  ruleCount: 0,
  sizes: [],
  recognizerBreakdown: [],
  recognizerTotalMs: 0,
  analyzeTotalMsAtLargest: 0,
  kdf: {
    iterations: DEFAULT_ITERATIONS,
    rawMs: { median: 0, min: 0, max: 0, runs: 0 },
    encryptMs: { median: 0, min: 0, max: 0, runs: 0 },
    decryptMs: { median: 0, min: 0, max: 0, runs: 0 },
    maxLoopLagMs: 0,
    snapshotBytes: 0,
    entities: 0,
  },
  memory: [],
  maxRssMb: 0,
};

const cpu = cpus();
result.machine = {
  node: process.version,
  v8: process.versions.v8,
  platform: `${process.platform} ${process.arch}`,
  cpu: cpu[0]?.model.replace(/\s+/g, " ") ?? "inconnu",
  cores: cpu.length,
  ramMb: Math.round(totalmem() / 1024 / 1024),
};

sampleMemory("Démarrage");

// Corpus de phrases synthétiques du dépôt.
const corpus = readFileSync(join(REPO, "corpus", "ner-fr.jsonl"), "utf8")
  .split("\n")
  .filter((l) => l.trim() !== "")
  .map((l) => (JSON.parse(l) as { text: string }).text);

// Packs.
let t0 = performance.now();
const rules = allActiveRules();
const analyzer = createAnalyzer(rules);
result.loadPacksMs = performance.now() - t0;
result.ruleCount = rules.length;
sampleMemory("Packs chargés");

// NER.
const modelsDir = WITH_NER ? findModelsDir() : undefined;
let ner: NerEngine | undefined;
if (modelsDir) {
  const engine = new TransformersNerEngine({ localModelPath: modelsDir, device: "cpu" });
  t0 = performance.now();
  await engine.load();
  result.nerLoadMs = performance.now() - t0;
  result.nerModelDir = modelsDir;
  ner = engine;
  // Chauffe : les premiers appels d'ONNX Runtime sont plus lents que les suivants.
  let warm = 0;
  await engine.recognize("Claire Dubois a rencontré Jean Favre à Genève.", {
    nextId: () => `w${++warm}`,
  });
  sampleMemory("Modèle NER chargé");
}

const plan: TransformPlan = { mode: "pseudonymization", defaultOperator: "pseudonymize" };
let lastSession = createSession();

for (const target of SIZES) {
  const text = generate(target, corpus, 20261117 + target);
  const runs = target > 50_000 ? Math.min(RUNS, 3) : RUNS;
  if (textsDir) {
    mkdirSync(textsDir, { recursive: true });
    writeFileSync(join(textsDir, `texte-${target}.txt`), text + "\n");
  }
  const language = "fr" as const;

  // 1. Règles seules.
  const rulesRun = await timeIt(runs, () => analyzer.analyze(text, { language }));
  const rulesResult: AnalysisResult = rulesRun.last;

  // 2. NER seul, puis combiné.
  let nerStat: Stat | undefined;
  let combinedStat: Stat | undefined;
  let combined: AnalysisResult | undefined;
  if (ner) {
    const nerRun = await timeIt(runs, () => {
      let n = 0;
      const ctx: AnalysisContext = { nextId: () => `n${++n}`, language };
      return ner!.recognize(text, ctx);
    });
    nerStat = nerRun.stat;
    const combinedRun = await timeIt(runs, () => analyzer.analyze(text, { language, ner }));
    combinedStat = combinedRun.stat;
    combined = combinedRun.last;
  }
  const final: AnalysisResult = combined ?? rulesResult;
  const detections: Detection[] = final.detections;

  // 3. Transformation (pseudonymisation, session neuve à chaque essai), sur le fil principal dans l'application.
  const transformRun = await timeIt(runs, () => transform(text, detections, plan, createSession()));
  // Session et texte transformé de référence pour la réidentification.
  const session = createSession();
  const transformed = transform(text, detections, plan, session);
  lastSession = session;

  // 4. Réidentification de la réponse (ici : le texte pseudonymisé lui-même, cas le plus chargé).
  const reidRun = await timeIt(runs, () => reidentify(transformed.text, session));

  // 5. Coût de transfert worker → page : sérialisation + désérialisation (borne haute de ce que paie la page).
  const cloneRun = await timeIt(runs, () => structuredClone(final));

  // 6. Logique de la page hors DOM : découpage pour le surlignage, aperçu avant/après, aperçu de réidentification.
  const pageRun = await timeIt(runs, () => {
    buildSegments(text.length, detections);
    outputSegments(transformed);
    originalSegments(text, transformed);
  });
  const reid = reidentify(transformed.text, session);
  const pageReidRun = await timeIt(runs, () => prepareReidentifyPreview(reid));

  const byType: Record<string, number> = {};
  for (const d of detections) byType[d.entityType] = (byType[d.entityType] ?? 0) + 1;

  result.sizes.push({
    target,
    length: text.length,
    rulesMs: rulesRun.stat,
    ...(nerStat ? { nerMs: nerStat } : {}),
    ...(combinedStat ? { combinedMs: combinedStat } : {}),
    detectionsRules: rulesResult.detections.length,
    ...(combined ? { detectionsCombined: combined.detections.length } : {}),
    byType,
    transformMs: transformRun.stat,
    reidentifyMs: reidRun.stat,
    cloneMs: cloneRun.stat,
    pageLogicMs: pageRun.stat,
    pageReidLogicMs: pageReidRun.stat,
    replacements: reid.replacements.length,
  });
  sampleMemory(`Après les mesures à ${target.toLocaleString("fr-CH")} caractères`);

  // Détail par détecteur sur le plus grand texte : un seul passage, à froid de l'orchestrateur.
  if (target === Math.max(...SIZES)) {
    let n = 0;
    const ctx: AnalysisContext = { nextId: () => `r${++n}`, language };
    const per: Array<{ id: string; ms: number }> = [];
    for (const r of analyzer.recognizers) {
      const start = performance.now();
      await r.analyze(text, ctx);
      per.push({ id: r.id, ms: performance.now() - start });
    }
    per.sort((a, b) => b.ms - a.ms);
    result.recognizerBreakdown = per.slice(0, 10);
    result.recognizerTotalMs = per.reduce((s, p) => s + p.ms, 0);
    result.analyzeTotalMsAtLargest = rulesRun.stat.median;
  }
}

// ---------- dérivation de clé de l'export chiffré ----------
{
  const subtle = globalThis.crypto.subtle;
  const enc = new TextEncoder();
  const passphrase = "phrase de passe de mesure uniquement";
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));

  // Retard maximal d'une minuterie de 2 ms pendant les dérivations : la boucle d'événements reste-t-elle libre ?
  let maxLag = 0;
  let last = performance.now();
  const timer = setInterval(() => {
    const now = performance.now();
    maxLag = Math.max(maxLag, now - last - 2);
    last = now;
  }, 2);

  const raw = await timeIt(
    KDF_RUNS,
    async () => {
      const material = await subtle.importKey("raw", enc.encode(passphrase), "PBKDF2", false, [
        "deriveKey",
      ]);
      return subtle.deriveKey(
        { name: "PBKDF2", hash: "SHA-256", salt, iterations: DEFAULT_ITERATIONS },
        material,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"],
      );
    },
    true,
  );
  const snapshot = serializeSession(lastSession);
  const encrypted = await timeIt(KDF_RUNS, () => encryptSnapshot(snapshot, passphrase), true);
  const decrypted = await timeIt(KDF_RUNS, () => decryptSnapshot(encrypted.last, passphrase), true);
  clearInterval(timer);

  result.kdf = {
    iterations: DEFAULT_ITERATIONS,
    rawMs: raw.stat,
    encryptMs: encrypted.stat,
    decryptMs: decrypted.stat,
    maxLoopLagMs: Math.max(0, maxLag),
    snapshotBytes: encrypted.last.length,
    entities: snapshot.entities.length,
  };
}

sampleMemory("Fin");
result.memory = memSamples;
result.maxRssMb = process.resourceUsage().maxRSS / 1024;
result.dist = measureDist(distDir);

// ---------- sortie ----------
const out: string[] = [];
const m = result.machine;
out.push("# Mesures de performance (scripts/perf/measure.ts)");
out.push("");
out.push(`Machine : ${m.cpu}, ${m.cores} cœur(s), ${m.ramMb} Mo de RAM, ${m.platform}.`);
out.push("Tailles de fichiers en Kio et Mio (1 Mio = 1 048 576 octets), libellées Ko et Mo.");
out.push(
  `Node ${m.node} (V8 ${m.v8}). Répétitions : ${RUNS} (3 au plus au-delà de 50 000 caractères), valeur affichée : médiane (min–max), en ms.`,
);
out.push(
  `Règles actives : ${result.ruleCount} (tous les packs livrés). Chargement et compilation des packs : ${fmt(result.loadPacksMs, 0)} ms.`,
);
if (ner) {
  out.push(
    `NER : ${DEFAULT_NER_MODEL} (q8, onnxruntime-node, device cpu), chargement ${fmt(result.nerLoadMs ?? 0, 0)} ms. Modèles dans ${result.nerModelDir}.`,
  );
} else {
  out.push("NER : non mesuré (modèle introuvable ou --no-ner).");
}
out.push("");

out.push("## Analyse");
out.push("");
out.push(
  "| Taille visée | Longueur réelle | Détections (règles) | Règles seules | NER seul | Règles + NER |",
);
out.push("|---:|---:|---:|---|---|---|");
for (const s of result.sizes) {
  out.push(
    `| ${s.target.toLocaleString("fr-CH")} | ${s.length.toLocaleString("fr-CH")} | ${s.detectionsRules} | ${cell(s.rulesMs)} | ${cell(s.nerMs)} | ${cell(s.combinedMs)} |`,
  );
}
out.push("");
out.push("## Détections retenues par type (configuration la plus complète)");
out.push("");
const types = [...new Set(result.sizes.flatMap((s) => Object.keys(s.byType)))].sort();
out.push(`| Taille visée | Total | ${types.join(" | ")} |`);
out.push(`|---:|---:|${types.map(() => "---:").join("|")}|`);
for (const s of result.sizes) {
  const total = s.detectionsCombined ?? s.detectionsRules;
  out.push(
    `| ${s.target.toLocaleString("fr-CH")} | ${total} | ${types.map((t) => s.byType[t] ?? 0).join(" | ")} |`,
  );
}
out.push("");

out.push("## Travail qui s'exécute sur le fil principal de la page (hors rendu DOM)");
out.push("");
out.push(
  "| Taille visée | Transformation | Réidentification | Découpage surlignage + aperçus | Aperçu de réidentification | Transfert worker → page (structuredClone) | Jetons remis |",
);
out.push("|---:|---|---|---|---|---|---:|");
for (const s of result.sizes) {
  out.push(
    `| ${s.target.toLocaleString("fr-CH")} | ${cell(s.transformMs)} | ${cell(s.reidentifyMs)} | ${cell(s.pageLogicMs)} | ${cell(s.pageReidLogicMs)} | ${cell(s.cloneMs)} | ${s.replacements} |`,
  );
}
out.push("");

out.push("## Détecteurs les plus coûteux, sur le plus grand texte (un passage)");
out.push("");
out.push("| Détecteur | ms |");
out.push("|---|---:|");
for (const r of result.recognizerBreakdown) out.push(`| ${r.id} | ${fmt(r.ms, 1)} |`);
out.push("");
out.push(
  `Somme de tous les détecteurs : ${fmt(result.recognizerTotalMs, 0)} ms ; analyse complète (médiane) : ${fmt(result.analyzeTotalMsAtLargest, 0)} ms. Le reste (contexte, fusion des noms adjacents, conflits) : ${result.analyzeTotalMsAtLargest > result.recognizerTotalMs ? `${fmt(result.analyzeTotalMsAtLargest - result.recognizerTotalMs, 0)} ms` : "négligeable (sous le bruit de mesure)"}.`,
);
out.push("");

const k = result.kdf;
out.push("## Export chiffré (PBKDF2-SHA-256, WebCrypto)");
out.push("");
out.push(
  `Itérations : ${k.iterations.toLocaleString("fr-CH")} ; ${k.entities} entités dans la table exportée (${kb(k.snapshotBytes)} Ko de fichier chiffré).`,
);
out.push("");
out.push("| Opération | ms (médiane, min–max) |");
out.push("|---|---|");
out.push(`| Dérivation de clé seule (importKey + deriveKey) | ${cell(k.rawMs)} |`);
out.push(`| encryptSnapshot (dérivation + chiffrement) | ${cell(k.encryptMs)} |`);
out.push(`| decryptSnapshot (dérivation + déchiffrement) | ${cell(k.decryptMs)} |`);
out.push("");
out.push(
  `Retard maximal d'une minuterie de 2 ms pendant ces opérations : ${fmt(k.maxLoopLagMs, 1)} ms (boucle d'événements de Node).`,
);
out.push("");

out.push("## Mémoire");
out.push("");
out.push("| Point de mesure | RSS (Mo) | Tas JS (Mo) | Externe + ArrayBuffer (Mo) |");
out.push("|---|---:|---:|---:|");
for (const s of result.memory)
  out.push(`| ${s.label} | ${fmt(s.rssMb, 0)} | ${fmt(s.heapMb, 0)} | ${fmt(s.externalMb, 0)} |`);
out.push("");
out.push(
  `Pic de mémoire résidente du processus : ${fmt(result.maxRssMb, 0)} Mo.${(globalThis as { gc?: unknown }).gc ? "" : " (Le ramasse-miettes n'est pas forcé : lancer avec --expose-gc pour des tas plus nets.)"}`,
);
out.push("");

out.push("## Taille du build");
out.push("");
if (!result.dist) {
  out.push(`Dossier ${distDir} introuvable : lancer \`npm run build\` d'abord.`);
} else {
  const sum = (kind: DistFile["kind"], field: "bytes" | "gzip" = "bytes") =>
    result.dist!.filter((f) => f.kind === kind).reduce((a, f) => a + (f[field] ?? 0), 0);
  const total = result.dist.reduce((a, f) => a + f.bytes, 0);
  const noModel = total - sum("model");
  out.push("| Fichier | Taille (Ko) | Gzip (Ko) |");
  out.push("|---|---:|---:|");
  for (const f of result.dist.filter((f) => f.kind !== "model")) {
    out.push(`| ${f.path} | ${kb(f.bytes)} | ${f.gzip !== undefined ? kb(f.gzip) : ""} |`);
  }
  for (const f of result.dist.filter((f) => f.kind === "model")) {
    out.push(`| ${f.path} | ${kb(f.bytes)} | |`);
  }
  out.push("");
  out.push("| Catégorie | Taille (Mo) | Gzip (Mo) |");
  out.push("|---|---:|---:|");
  out.push(`| JavaScript | ${mb(sum("js"))} | ${mb(sum("js", "gzip"))} |`);
  out.push(`| CSS | ${mb(sum("css"))} | ${mb(sum("css", "gzip"))} |`);
  out.push(`| HTML | ${mb(sum("html"))} | ${mb(sum("html", "gzip"))} |`);
  out.push(
    `| ONNX Runtime (dist/ort) | ${mb(sum("ort"))} | ${mb(sum("ort", "gzip"))} (wasm seul compressible) |`,
  );
  out.push(`| Modèle NER (dist/models) | ${mb(sum("model"))} | non compressé |`);
  out.push(`| Autres | ${mb(sum("other"))} | |`);
  out.push(`| **Total sans le modèle** | ${mb(noModel)} | |`);
  out.push(`| **Total** | ${mb(total)} | |`);
}
out.push("");

process.stdout.write(out.join("\n") + "\n");
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(result, null, 2) + "\n");
await ner?.dispose();
