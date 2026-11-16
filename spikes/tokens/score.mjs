// S2 — Calcul du taux de jetons retrouvés dans les réponses des LLM.
//
// Usage :
//   node spikes/tokens/score.mjs                       # lit reponses/<llm>/*.txt, écrit results.md
//   node spikes/tokens/score.mjs --include-exemple     # inclut reponses/exemple (FACTICES) -> results.exemple.md
//   node spikes/tokens/score.mjs --plan [llm]          # liste les essais attendus et ceux déjà faits
//   options : --dir <dossier>  --out <fichier>
//
// Nom attendu d'une réponse : reponses/<llm>/<texte>-<format>-<consigne>.txt
// Les dossiers dont le nom commence par `_` ou `.` et `reponses/exemple` (sans l'option) sont ignorés.

import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { analyze, findStrict } from "./analyzer.mjs";
import { CONSIGNES, LOTS, trialKey } from "./config.mjs";
import { ROOT, buildAll, loadCorpus } from "./corpus.mjs";
import { FORMAT_IDS } from "./formats.mjs";

export const THRESHOLD = 98; // % de jetons retrouvés en tolérant (ADR 0002)

/** `rh-A-traduire.txt` -> { texte: "rh", format: "A", consigne: "traduire" } ou null. */
export function parseResponseName(file) {
  const m = /^([^-]+)-([ABC])-(.+)\.txt$/i.exec(file);
  if (!m) return null;
  return { texte: m[1], format: m[2].toUpperCase(), consigne: m[3] };
}

/** Score d'une réponse : jetons attendus (ceux de la source) retrouvés en strict / en tolérant. */
export function scoreResponse(responseText, built) {
  const { table } = built;
  const expected = Object.keys(table);
  const strict = findStrict(responseText, { format: built.format, table });
  const tol = analyze(responseText, { format: built.format, table });
  const tolSet = new Set(tol.found);
  const variants = {};
  for (const m of tol.matches) for (const v of m.variants) variants[v] = (variants[v] ?? 0) + 1;
  return {
    expected: expected.length,
    strict: expected.filter((t) => strict.has(t)).length,
    tolerant: expected.filter((t) => tolSet.has(t)).length,
    unknown: tol.unknown.length,
    missing: expected.filter((t) => !tolSet.has(t)),
    variants,
  };
}

/** Lit toutes les réponses ; renvoie { records, ignored }. */
export function collect(dir, { includeExemple = false } = {}) {
  const corpus = loadCorpus();
  const ids = new Set(corpus.map((t) => t.id));
  const built = buildAll(corpus);
  const records = [];
  const ignored = [];
  if (!existsSync(dir)) return { records, ignored };

  for (const llm of readdirSync(dir).sort()) {
    const llmDir = join(dir, llm);
    if (!statSync(llmDir).isDirectory()) continue;
    if (llm.startsWith("_") || llm.startsWith(".")) continue;
    if (llm === "exemple" && !includeExemple) continue;
    for (const file of readdirSync(llmDir).sort()) {
      if (!file.endsWith(".txt")) continue;
      const rel = `${llm}/${file}`;
      const p = parseResponseName(file);
      if (!p || !ids.has(p.texte) || !(p.consigne in CONSIGNES) || file.startsWith("_")) {
        if (!file.startsWith("_") && !/^(lisezmoi|readme)/i.test(file)) {
          ignored.push(`${rel} (nom non reconnu : attendu <texte>-<A|B|C>-<consigne>.txt)`);
        }
        continue;
      }
      const b = built.get(`${p.texte}|${p.format}`);
      const text = readFileSync(join(llmDir, file), "utf8");
      records.push({
        llm,
        ...p,
        file: rel,
        ...scoreResponse(text, { ...b, format: p.format }),
      });
    }
  }
  return { records, ignored };
}

export function aggregate(records) {
  const a = { n: records.length, expected: 0, strict: 0, tolerant: 0, unknown: 0, variants: {} };
  for (const r of records) {
    a.expected += r.expected;
    a.strict += r.strict;
    a.tolerant += r.tolerant;
    a.unknown += r.unknown;
    for (const [k, v] of Object.entries(r.variants)) a.variants[k] = (a.variants[k] ?? 0) + v;
  }
  return a;
}

const pct = (found, expected) =>
  expected === 0 ? "—" : `${((100 * found) / expected).toFixed(1).replace(".", ",")} %`;
const rate = (found, expected) => (expected === 0 ? null : (100 * found) / expected);
const uniq = (xs) => [...new Set(xs)];
const variantsText = (v) =>
  Object.entries(v)
    .sort((x, y) => y[1] - x[1])
    .map(([k, n]) => `${k} ×${n}`)
    .join(", ") || "aucune";

function table(headers, rows) {
  const line = (cells) => `| ${cells.join(" | ")} |`;
  return [line(headers), line(headers.map(() => "---")), ...rows.map(line)].join("\n");
}

/** Rapport Markdown. */
export function renderMarkdown(records, ignored, { demo = false, date = new Date() } = {}) {
  const llms = uniq(records.map((r) => r.llm)).sort();
  const out = [];
  const day = date.toISOString().slice(0, 10);

  out.push("# Résultats S2 — robustesse des jetons de pseudonymisation");
  out.push("");
  if (demo) {
    out.push(
      "> **DÉMONSTRATION.** Ce fichier est calculé sur les réponses FACTICES de `reponses/exemple/`, " +
        "écrites à la main pour tester `score.mjs`. Il ne dit rien des LLM réels. " +
        "Les vrais résultats vont dans `results.md`.",
    );
    out.push("");
  }
  out.push(`Généré le ${day} par \`score.mjs\`. ${records.length} réponse(s), ${llms.length} LLM.`);
  out.push("");
  out.push(
    "- **Strict** : le jeton canonique apparaît à l'identique (frontières de mots respectées).",
  );
  out.push(
    "- **Tolérant** : le jeton est retrouvé par l'analyseur (casse, séparateur, zéros, crochets, type traduit, possessif…).",
  );
  out.push(
    "- **Inconnus** : formes qui ressemblent à un jeton mais ne sont pas dans la table du texte (ex. `PERSONNE_009`).",
  );
  out.push(
    "- Les taux sont des **moyennes pondérées** : jetons distincts retrouvés / jetons distincts attendus, sommés sur les réponses.",
  );
  out.push("");

  // 1. Critère de décision
  const crit = records.filter((r) => CONSIGNES[r.consigne].complete && !CONSIGNES[r.consigne].control);
  out.push(`## 1. Critère de décision (≥ ${THRESHOLD} % en tolérant)`);
  out.push("");
  out.push(
    "Réponses aux consignes **complètes** (traduire, reformuler) avec consigne système. " +
      "Un format est retenu s'il atteint le seuil pour **chaque** LLM testé.",
  );
  out.push("");
  const verdictRows = [];
  const okByFormat = Object.fromEntries(FORMAT_IDS.map((f) => [f, []]));
  for (const llm of llms) {
    for (const f of FORMAT_IDS) {
      const rs = crit.filter((r) => r.llm === llm && r.format === f);
      const a = aggregate(rs);
      const tol = rate(a.tolerant, a.expected);
      const ok = tol !== null && tol >= THRESHOLD;
      if (tol !== null) okByFormat[f].push(ok);
      verdictRows.push([
        llm,
        f,
        a.n,
        a.expected,
        pct(a.strict, a.expected),
        pct(a.tolerant, a.expected),
        a.unknown,
        tol === null ? "pas de données" : ok ? "oui" : "non",
      ]);
    }
  }
  out.push(table(["LLM", "Format", "Réponses", "Jetons attendus", "Strict", "Tolérant", "Inconnus", `≥ ${THRESHOLD} %`], verdictRows));
  out.push("");
  const passing = FORMAT_IDS.filter((f) => okByFormat[f].length > 0 && okByFormat[f].every(Boolean));
  out.push(
    passing.length
      ? `**Formats atteignant le seuil pour tous les LLM testés : ${passing.join(", ")}.**`
      : "**Aucun format n'atteint le seuil pour tous les LLM testés** (ou données insuffisantes).",
  );
  out.push("");
  out.push(
    "Rappel : avec 7 à 8 jetons par texte, un seul jeton manquant coûte 12 à 14 points sur une réponse isolée et environ 1,3 point sur le lot 1 complet (78 jetons) ; " +
      "lire ces taux avec le nombre de réponses (colonne « Réponses »).",
  );
  out.push("");

  // 2. Par LLM, format et consigne
  out.push("## 2. Détail par LLM, format et consigne");
  out.push("");
  out.push(
    "Les consignes « partielles » (résumer, répondre, extraire) peuvent omettre des jetons sans erreur du LLM : taux **indicatifs**. " +
      "L'essai témoin (`traduire-sans`) n'a pas de consigne système.",
  );
  out.push("");
  const rows2 = [];
  for (const llm of llms) {
    for (const c of Object.keys(CONSIGNES)) {
      for (const f of FORMAT_IDS) {
        const rs = records.filter((r) => r.llm === llm && r.consigne === c && r.format === f);
        if (!rs.length) continue;
        const a = aggregate(rs);
        const kind = CONSIGNES[c].control ? "témoin" : CONSIGNES[c].complete ? "complète" : "partielle";
        rows2.push([llm, c, kind, f, a.n, a.expected, pct(a.strict, a.expected), pct(a.tolerant, a.expected), a.unknown]);
      }
    }
  }
  out.push(table(["LLM", "Consigne", "Type", "Format", "Réponses", "Attendus", "Strict", "Tolérant", "Inconnus"], rows2));
  out.push("");

  // 3. Déformations
  out.push("## 3. Déformations observées (jetons retrouvés grâce à la tolérance)");
  out.push("");
  const rows3 = [];
  for (const llm of llms) {
    for (const f of FORMAT_IDS) {
      const rs = records.filter((r) => r.llm === llm && r.format === f);
      if (rs.length) rows3.push([llm, f, variantsText(aggregate(rs).variants)]);
    }
  }
  out.push(table(["LLM", "Format", "Variantes (nombre d'occurrences)"], rows3));
  out.push("");

  // 4. Couverture
  out.push("## 4. Couverture du plan d'essais");
  out.push("");
  const have = (llm) => new Set(records.filter((r) => r.llm === llm).map(trialKey));
  const rows4 = llms.map((llm) => {
    const h = have(llm);
    const cells = Object.values(LOTS).map((lot) => `${lot.trials.filter((t) => h.has(trialKey(t))).length}/${lot.trials.length}`);
    return [llm, ...cells];
  });
  out.push(table(["LLM", "Lot 1 (obligatoire)", "Lot 2", "Lot 3 (témoin)"], rows4));
  out.push("");

  // 5. Détail par réponse
  out.push("## 5. Détail par réponse");
  out.push("");
  const rows5 = records
    .slice()
    .sort((a, b) => a.file.localeCompare(b.file))
    .map((r) => [
      r.file,
      `${r.strict}/${r.expected}`,
      `${r.tolerant}/${r.expected}`,
      r.unknown,
      r.missing.length ? r.missing.map((t) => `\`${t}\``).join(" ") : "—",
    ]);
  out.push(table(["Fichier", "Strict", "Tolérant", "Inconnus", "Jetons non retrouvés"], rows5));
  out.push("");

  if (ignored.length) {
    out.push("## Fichiers ignorés");
    out.push("");
    for (const i of ignored) out.push(`- ${i}`);
    out.push("");
  }
  return out.join("\n");
}

function parseArgs(argv) {
  const opts = { dir: join(ROOT, "reponses"), includeExemple: false, out: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--include-exemple") opts.includeExemple = true;
    else if (a === "--dir") opts.dir = resolve(argv[++i] ?? "");
    else if (a === "--out") opts.out = resolve(argv[++i] ?? "");
    else if (a === "--plan") {
      opts.plan = true;
      if (argv[i + 1] && !argv[i + 1].startsWith("--")) opts.planLlm = argv[++i];
    } else if (a === "--help" || a === "-h") opts.help = true;
    else throw new Error(`Option inconnue : ${a}`);
  }
  return opts;
}

/** Affiche le plan d'essais et marque ceux dont la réponse existe déjà. */
function printPlan(dir, llm) {
  const { records } = collect(dir);
  const done = new Set(records.filter((r) => !llm || r.llm === llm).map(trialKey));
  const who = llm ? `reponses/${llm}/` : "reponses/<llm>/";
  for (const lot of Object.values(LOTS)) {
    console.log(`\n${lot.label}`);
    for (const t of lot.trials) {
      const k = trialKey(t);
      console.log(`  [${done.has(k) ? "x" : " "}] ${who}${k}.txt`);
    }
  }
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.log(
      "Usage : node spikes/tokens/score.mjs [--include-exemple] [--plan [llm]] [--dir <dossier>] [--out <fichier>]",
    );
    return;
  }
  if (opts.plan) {
    printPlan(opts.dir, opts.planLlm);
    return;
  }
  const { records, ignored } = collect(opts.dir, { includeExemple: opts.includeExemple });
  const shown = relative(process.cwd(), opts.dir) || ".";
  if (records.length === 0) {
    console.log(`Aucune réponse trouvée dans ${shown}/<llm>/.`);
    console.log("Attendu : <llm>/<texte>-<format>-<consigne>.txt (ex. chatgpt/rh-A-traduire.txt).");
    console.log("La procédure est décrite dans spikes/tokens/consignes.md.");
    if (!opts.includeExemple) {
      console.log("Pour voir le script tourner sur les réponses factices : node spikes/tokens/score.mjs --include-exemple");
    }
    for (const i of ignored) console.log(`Ignoré : ${i}`);
    return;
  }
  const out = opts.out ?? join(ROOT, opts.includeExemple ? "results.exemple.md" : "results.md");
  const md = renderMarkdown(records, ignored, { demo: opts.includeExemple });
  writeFileSync(out, md, "utf8");
  console.log(`${records.length} réponse(s) analysée(s). Rapport écrit dans ${relative(process.cwd(), out)}.`);
  for (const i of ignored) console.log(`Ignoré : ${i}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
