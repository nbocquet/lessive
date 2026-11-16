/**
 * Génère rules/noms-famille.json à partir des fichiers officiels de noms de famille.
 *
 * Usage (depuis la racine du dépôt) :
 *   node packs/lang-fr-en/tools/build-lastnames.mjs \
 *     --ofs noms-ofs.csv        # CSV « nom;valeur » exporté de l'OFS (su-q-01.04.00.13, feuille CH)
 *     --insee noms2008nat.txt   # fichier INSEE des noms (tabulations, une colonne par décennie)
 *     [--since 1921]            # INSEE : décennies commençant à partir de cette année (défaut 1921)
 *     [--min-ofs 300] [--min-insee 2000] [--min-length 3] [--max-names 9000]
 *
 * Les noms qui sont aussi des mots courants (tools/ambiguous-lastnames.json) vont dans une règle
 * séparée, « noms-famille-ambigus » : majuscule exacte et score 0,3, donc retenus seulement
 * accolés à un prénom (fusion des noms adjacents) ; ils restent aussi détectés par le NER et
 * par les motifs « titre + nom ».
 * Sans dépendance ; Node 22.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { CONTEXT_EN, CONTEXT_FR, CONTEXT_FULL, TITLE_WORDS, fold, titleCase } from "./build.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const o = { since: 1921, minOfs: 300, minInsee: 2000, minLength: 3, maxNames: 9000 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const v = () => {
      const x = argv[++i];
      if (x === undefined) throw new Error(`Valeur manquante après ${a}`);
      return x;
    };
    if (a === "--ofs") o.ofs = v();
    else if (a === "--insee") o.insee = v();
    else if (a === "--since") o.since = Number(v());
    else if (a === "--min-ofs") o.minOfs = Number(v());
    else if (a === "--min-insee") o.minInsee = Number(v());
    else if (a === "--min-length") o.minLength = Number(v());
    else if (a === "--max-names") o.maxNames = Number(v());
    else throw new Error(`Option inconnue : ${a}`);
  }
  if (!o.ofs && !o.insee) throw new Error("Indiquer au moins --ofs ou --insee.");
  return o;
}

const lines = (path) =>
  readFileSync(path, "utf8")
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((l) => l.trim() !== "");

/** OFS : « nom;valeur » (en-tête ignorée). Casse d'origine conservée (Müller, Da Silva). */
function readOfs(path, min) {
  const out = [];
  for (const line of lines(path).slice(1)) {
    const [name, n] = line.split(";");
    const count = Number(n);
    if (name && Number.isFinite(count) && count >= min) out.push({ name: name.trim(), count });
  }
  return out;
}

/** INSEE : NOM puis une colonne par décennie (_1891_1900…). Noms en majuscules sans accents. */
function readInsee(path, since, min) {
  const [header, ...rows] = lines(path);
  const cols = header.split("\t");
  const idx = cols
    .map((c, i) => [c, i])
    .filter(([c]) => /^_\d{4}_\d{4}$/.test(c) && Number(c.slice(1, 5)) >= since)
    .map(([, i]) => i);
  if (idx.length === 0) throw new Error(`INSEE : aucune décennie à partir de ${since}.`);
  const out = [];
  for (const row of rows) {
    const f = row.split("\t");
    if (!f[0] || f[0] === "AUTRES NOMS") continue;
    const count = idx.reduce((s, i) => s + (Number(f[i]) || 0), 0);
    if (count >= min) out.push({ name: titleCase(f[0].trim()), count });
  }
  return out;
}

function main() {
  const o = parseArgs(process.argv.slice(2));
  const excludedData = JSON.parse(readFileSync(join(HERE, "ambiguous-lastnames.json"), "utf8"));
  const excluded = new Set(excludedData.terms.split(/\s+/).filter(Boolean).map(fold));
  // Un mot de contexte (titre, formule d'appel) ne doit jamais être pris pour un nom :
  // « Bonjour » et « Maître » sont des noms de famille en Suisse.
  const contextWords = new Set([...TITLE_WORDS, ...CONTEXT_FR, ...CONTEXT_EN].map(fold));

  // OFS d'abord : sa graphie (accents, casse mixte) est préférée à celle de l'INSEE.
  const sources = [
    ...(o.ofs ? readOfs(o.ofs, o.minOfs).map((x) => ({ ...x, src: "OFS" })) : []),
    ...(o.insee
      ? readInsee(o.insee, o.since, o.minInsee).map((x) => ({ ...x, src: "INSEE" }))
      : []),
  ];
  const byKey = new Map();
  for (const x of sources) {
    const key = fold(x.name);
    const prev = byKey.get(key);
    if (prev) prev.count += x.count;
    else byKey.set(key, { ...x });
  }
  const valid = [...byKey.entries()]
    .filter(([key, x]) => {
      if (!/^[\p{L}][\p{L}\p{M}'’ -]*$/u.test(x.name)) return false;
      if (contextWords.has(key)) return false;
      return key.replace(/[^a-z]/g, "").length >= o.minLength;
    })
    .sort(([, a], [, b]) => b.count - a.count)
    .slice(0, o.maxNames);
  const byName = (a, b) => a.localeCompare(b, "fr");
  const kept = valid
    .filter(([k]) => !excluded.has(k))
    .map(([, x]) => x.name)
    .sort(byName);
  const ambiguous = valid
    .filter(([k]) => excluded.has(k))
    .map(([, x]) => x.name)
    .sort(byName);

  const rule = {
    rules: [
      {
        kind: "dictionary",
        id: "noms-famille",
        entityType: "PERSON",
        score: 0.4,
        terms: kept,
        context: CONTEXT_FULL,
        description:
          "Noms de famille fréquents en Suisse (OFS) et en France (INSEE). Score 0,4 : retenu avec un mot de contexte (titre, formule d'appel) ou accolé à un prénom (fusion des noms adjacents dans le moteur).",
      },
      {
        kind: "dictionary",
        id: "noms-famille-ambigus",
        entityType: "PERSON",
        score: 0.3,
        caseSensitive: true,
        terms: ambiguous,
        description:
          "Noms de famille qui sont aussi des mots courants (Blanc, Boulanger, Berger…). Majuscule exacte et score 0,3 : retenus seulement accolés à un prénom (Pierre Blanc).",
      },
    ],
  };
  const out = join(HERE, "..", "rules", "noms-famille.json");
  writeFileSync(out, JSON.stringify(rule, null, 2) + "\n");
  process.stdout.write(
    `${kept.length} noms de famille + ${ambiguous.length} ambigus (${[o.ofs && "OFS", o.insee && "INSEE"].filter(Boolean).join(" + ")}) ; écrit dans ${out}\n`,
  );
}

main();
