#!/usr/bin/env node
/**
 * Génère les règles du pack lang-fr-en (rules/*.json) — Node pur, aucune dépendance.
 *
 * Usage :
 *   node packs/lang-fr-en/tools/build.mjs
 *       Liste « rédigée pour Lessive » (tools/handwritten-names.json).
 *   node packs/lang-fr-en/tools/build.mjs --insee nat2024.csv [--ssa dossier-yob] [--ofs fichier.csv]
 *       Liste issue des fichiers officiels que vous avez téléchargés ET décompressés.
 *
 * Options :
 *   --min-count N    effectif cumulé minimal par prénom (défaut : INSEE 1000, SSA 20000, OFS 100)
 *   --max-names N    nombre maximal de prénoms dans la règle (défaut 6000)
 *   --min-length N   longueur minimale d'un prénom (défaut 3)
 *   --exclude FICHIER  termes supplémentaires à retirer (un par ligne ou séparés par des espaces)
 *   --out DOSSIER    dossier de sortie des règles (défaut : packs/lang-fr-en/rules)
 *
 * Après génération : `npx prettier --write packs/lang-fr-en` puis `npx vitest run packs -t lang-fr-en`.
 * Voir packs/lang-fr-en/README.md pour les sources, licences et la procédure complète.
 */
import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_OUT = join(HERE, "..", "rules");

/* ------------------------------------------------------------------ */
/* Contexte : titres, verbes de relation, formules d'appel et de clôture */
/* ------------------------------------------------------------------ */

/** Titres de civilité, communs aux deux langues (les textes mélangent souvent fr et en). */
export const TITLE_WORDS = [
  "M.",
  "MM.",
  "Mme",
  "Mmes",
  "Mlle",
  "Mlles",
  "Monsieur",
  "Messieurs",
  "Madame",
  "Mesdames",
  "Mademoiselle",
  "Dr",
  "Dre",
  "Docteur",
  "Docteure",
  "Pr",
  "Prof",
  "Professeur",
  "Professeure",
  "Maître",
  "Mr",
  "Mrs",
  "Ms",
  "Miss",
  "Mx",
  "Sir",
];

export const CONTEXT_FR = [
  "je suis",
  "je m'appelle",
  "bonjour",
  "bonsoir",
  "salut",
  "cher",
  "chère",
  "chers",
  "chères",
  "cordialement",
  "salutations",
  "signé",
  "de la part de",
  "à l'attention de",
  "contactez",
  "appelez",
  "mon fils",
  "ma fille",
  "mon mari",
  "ma femme",
  "mon collègue",
  "ma collègue",
  "mon frère",
  "ma sœur",
  "mon père",
  "ma mère",
  "mon ami",
  "mon amie",
  "prénom",
  "nom",
  "né",
  "née",
  "épouse",
  "destinataire",
  "expéditeur",
];

export const CONTEXT_EN = [
  "i am",
  "i'm",
  "my name is",
  "hi",
  "hello",
  "hey",
  "dear",
  "regards",
  "sincerely",
  "thanks",
  "thank you",
  "cheers",
  "signed",
  "attn",
  "attention",
  "named",
  "called",
  "name",
  "my son",
  "my daughter",
  "my husband",
  "my wife",
  "my colleague",
  "my brother",
  "my sister",
  "my father",
  "my mother",
  "my friend",
];

const CONTEXT_FULL = { words: { any: TITLE_WORDS, fr: CONTEXT_FR, en: CONTEXT_EN } };
const CONTEXT_TITLES = { words: { any: TITLE_WORDS } };

/* ------------------------------------------------------------------ */
/* Motifs « titre + nom » (le titre n'est PAS dans l'intervalle détecté) */
/* ------------------------------------------------------------------ */

// Première lettre d'un nom : majuscule latine (classes explicites : \p{Lu} met en échec le contrôle ReDoS).
const UP = "[A-ZÀ-ÖØ-ÞĆČĐĞİŁŃŒŚŞŠŹŻŽ]";
const LT = "[\\p{L}\\p{M}]";
// Un mot de nom : Dupont, DUPONT, Martin-Favre, O'Brien, D'Angelo.
const WORD = `${UP}(?:['’]${UP})?${LT}+(?:-${UP}${LT}+)*`;
// Titres, factorisés (le contrôle ReDoS pénalise les longues alternances).
const TITLES =
  "M(?:M?\\.|me?s?\\.?|lles?\\.?|onsieur|essieurs|adame|esdames|ademoiselle|rs?\\.?|s\\.?|iss|x\\.?)" +
  "|Dre?\\.?|Docteure?|Pr\\.?|Prof\\.?|Professeure?|Ma[iî]tre|Sir";
// Titre suivi d'un ou deux espaces (ou insécables) : le motif commence juste après.
const AFTER_TITLE = `(?<=\\b(?:${TITLES})[ \\t\\u00a0]{1,2})`;
// Particules (factorisées pour le contrôle ReDoS) : de, de la, de l', du, des, da, di, del, della,
// van, von, van der, ter, ten ; d'.
const PARTICLE =
  "d(?:e(?:[ \\t]la|l|lla|[nrs])?|[aiu]s?)[ \\t]|v[ao]n[ \\t](?:d[ae][rn][ \\t])?|te[nr][ \\t]|d['’]|de[ \\t]l['’]";
// Mots qui, après un titre abrégé, sont presque sûrement un début de phrase (« M. Il … »).
const NOT_A_NAME = "(?!(?:Ils?|Elles?|Je|Nous|Vous|He|She|It|We)\\b)";

const PATTERNS = [
  {
    kind: "pattern",
    id: "titres-nom",
    entityType: "PERSON",
    score: 0.7,
    flags: "u",
    pattern: `${AFTER_TITLE}${NOT_A_NAME}${WORD}(?:[ \\t]${WORD})?`,
    context: CONTEXT_TITLES,
    description:
      "Nom (un ou deux mots capitalisés) précédé d'un titre : M. Dupont, Mme Martin-Favre, Dr Keller, Mr Smith, Maître Rossi. Le titre est exclu de l'intervalle.",
  },
  {
    kind: "pattern",
    id: "titres-nom-particule",
    entityType: "PERSON",
    score: 0.7,
    flags: "u",
    pattern: `${AFTER_TITLE}(?:${PARTICLE})${WORD}`,
    context: CONTEXT_TITLES,
    description:
      "Nom à particule juste après le titre : M. de Rougemont, Mme de la Fontaine, Dr van Berg. La particule est incluse.",
  },
  {
    kind: "pattern",
    id: "titres-prenom-particule",
    entityType: "PERSON",
    score: 0.7,
    flags: "u",
    pattern: `(?<=\\b(?:${TITLES})[ \\t\\u00a0]${UP}[-\\p{L}\\p{M}]+[ \\t])(?:${PARTICLE})${WORD}`,
    context: CONTEXT_TITLES,
    description:
      "Partie à particule d'un nom précédé d'un titre et d'un prénom : « de la Fontaine » dans Mme Anne de la Fontaine (le prénom est détecté par titres-nom).",
  },
];

/* ------------------------------------------------------------------ */
/* Entrées : liste rédigée ou fichiers officiels                        */
/* ------------------------------------------------------------------ */

const words = (s) => s.split(/\s+/).filter(Boolean);

/** Clé de comparaison : minuscules, sans accents. */
const fold = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** « JEAN-LUC » → « Jean-Luc » ; « d'artagnan » n'est pas un cas visé. */
function titleCase(name) {
  return name
    .toLocaleLowerCase("fr")
    .replace(/(^|[-' ])(\p{L})/gu, (_, sep, c) => sep + c.toLocaleUpperCase("fr"));
}

function parseArgs(argv) {
  const opts = { out: DEFAULT_OUT, minLength: 3, maxNames: 6000 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`Valeur manquante après ${a}`);
      return v;
    };
    if (a === "--insee") opts.insee = next();
    else if (a === "--ssa") opts.ssa = next();
    else if (a === "--ofs") opts.ofs = next();
    else if (a === "--min-count") opts.minCount = Number(next());
    else if (a === "--max-names") opts.maxNames = Number(next());
    else if (a === "--min-length") opts.minLength = Number(next());
    else if (a === "--exclude") opts.exclude = next();
    else if (a === "--out") opts.out = next();
    else throw new Error(`Option inconnue : ${a}`);
  }
  return opts;
}

/** Découpe une ligne CSV simple (guillemets doubles gérés, pas de retour à la ligne dans un champ). */
function splitCsvLine(line, delim) {
  const out = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === delim) {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out;
}

/**
 * Lit un CSV avec en-tête (INSEE, OFS…) : détecte le séparateur, la colonne du prénom et celle de l'effectif.
 * Renvoie une Map prénom → effectif cumulé.
 */
function readCsvCounts(path, label) {
  const text = readFileSync(path, "utf8").replace(/^\uFEFF/, "");
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  const header = lines.shift();
  if (header === undefined) throw new Error(`${label} : fichier vide (${path})`);
  const delim = [";", "\t", ","].sort((a, b) => header.split(b).length - header.split(a).length)[0];
  const cols = splitCsvLine(header, delim).map((c) => fold(c.trim()));
  const nameIdx = cols.findIndex((c) =>
    /^(preusuel|prenom|prenoms|first_?name|vorname|name|nom_?prenom)$/.test(c),
  );
  const countIdx = cols.findIndex((c) =>
    /^(nombre|valeur|count|number|anzahl|n|effectif|nombre_?de_?naissances?)$/.test(c),
  );
  if (nameIdx < 0 || countIdx < 0) {
    throw new Error(
      `${label} : colonnes introuvables dans l'en-tête « ${header} ». ` +
        "Attendu : une colonne de prénoms (preusuel, prenom, vorname…) et une d'effectifs (nombre, valeur, anzahl…).",
    );
  }
  const counts = new Map();
  for (const line of lines) {
    const f = splitCsvLine(line, delim);
    const name = (f[nameIdx] ?? "").trim();
    const n = Number((f[countIdx] ?? "").trim().replace(/\s/g, ""));
    if (!name || name.startsWith("_") || !Number.isFinite(n)) continue; // _PRENOMS_RARES (INSEE)
    counts.set(name, (counts.get(name) ?? 0) + n);
  }
  return counts;
}

/** SSA : dossier contenant yobAAAA.txt (« Nom,Sexe,Effectif », sans en-tête). */
function readSsaCounts(path) {
  const files = statSync(path).isDirectory()
    ? readdirSync(path)
        .filter((f) => /^yob\d{4}\.txt$/.test(f))
        .map((f) => join(path, f))
    : [path];
  if (files.length === 0) throw new Error(`SSA : aucun fichier yobAAAA.txt dans ${path}`);
  const counts = new Map();
  for (const file of files) {
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      const [name, , n] = line.split(",");
      const count = Number(n);
      if (!name || !Number.isFinite(count)) continue;
      counts.set(name, (counts.get(name) ?? 0) + count);
    }
  }
  return counts;
}

function loadHandwritten() {
  const data = JSON.parse(readFileSync(join(HERE, "handwritten-names.json"), "utf8"));
  return [...words(data.fr), ...words(data.en), ...words(data.other)];
}

/* ------------------------------------------------------------------ */
/* Assemblage                                                          */
/* ------------------------------------------------------------------ */

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const ambiguousData = JSON.parse(readFileSync(join(HERE, "ambiguous-names.json"), "utf8"));
  const ambiguous = words(ambiguousData.terms);
  const ambiguousKeys = new Set(ambiguous.map(fold));
  const excluded = new Set(ambiguousKeys);
  if (opts.exclude) {
    for (const w of words(readFileSync(opts.exclude, "utf8"))) excluded.add(fold(w));
  }

  let names;
  let provenance;
  const official = [
    ["INSEE", opts.insee && (() => readCsvCounts(opts.insee, "INSEE")), opts.minCount ?? 1000],
    ["SSA", opts.ssa && (() => readSsaCounts(opts.ssa)), opts.minCount ?? 20000],
    ["OFS", opts.ofs && (() => readCsvCounts(opts.ofs, "OFS")), opts.minCount ?? 100],
  ].filter(([, load]) => load);

  if (official.length === 0) {
    names = loadHandwritten().map(titleCase);
    names.sort((a, b) => a.localeCompare(b, "fr"));
    provenance = "liste rédigée pour Lessive (Apache 2.0)";
  } else {
    const ranked = new Map(); // clé pliée → { name, count }
    for (const [label, load, minCount] of official) {
      for (const [raw, count] of load()) {
        if (count < minCount) continue;
        const name = titleCase(raw.trim());
        const key = fold(name);
        const prev = ranked.get(key);
        if (prev) prev.count += count;
        else ranked.set(key, { name, count, label });
      }
    }
    names = [...ranked.values()]
      .sort((a, b) => b.count - a.count)
      .slice(0, opts.maxNames)
      .map((x) => x.name);
    provenance = `sources officielles : ${official.map(([l]) => l).join(", ")}`;
  }

  // Filtrage : caractères admis, longueur, ambiguïtés, doublons après pliage.
  const seen = new Set();
  const kept = [];
  let removedAmbiguous = 0;
  for (const name of names) {
    if (!/^[\p{L}][\p{L}'’-]*$/u.test(name)) continue;
    if (name.replace(/[-'’]/g, "").length < opts.minLength) continue;
    const key = fold(name);
    if (excluded.has(key)) {
      removedAmbiguous++;
      continue;
    }
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(name);
  }

  const rules = {
    prenoms: {
      rules: [
        {
          kind: "dictionary",
          id: "prenoms",
          entityType: "PERSON",
          score: 0.45,
          terms: kept,
          context: CONTEXT_FULL,
          description:
            "Prénoms courants (Suisse romande, France, monde anglophone). Score 0,45 : sous le seuil seul, au-dessus avec un titre, une formule d'appel ou un verbe de relation à proximité.",
        },
      ],
    },
    ambigus: {
      rules: [
        {
          kind: "dictionary",
          id: "prenoms-ambigus",
          entityType: "PERSON",
          score: 0.45,
          caseSensitive: true,
          terms: ambiguous.map(titleCase).sort((a, b) => a.localeCompare(b, "fr")),
          context: { ...CONTEXT_FULL, required: true },
          description:
            "Prénoms qui sont aussi des mots, des lieux ou des mois (Rose, Pierre, Florence, May…). Casse exacte et mot de contexte obligatoire.",
        },
      ],
    },
    titres: { rules: PATTERNS },
  };

  mkdirSync(opts.out, { recursive: true });
  const write = (file, data) =>
    writeFileSync(join(opts.out, file), JSON.stringify(data, null, 2) + "\n");
  write("prenoms.json", rules.prenoms);
  write("prenoms-ambigus.json", rules.ambigus);
  write("titres-nom.json", rules.titres);

  process.stdout.write(
    `${kept.length} prénoms (${provenance}) ; ${removedAmbiguous} retirés car ambigus ou exclus ; ` +
      `${ambiguous.length} prénoms ambigus ; règles écrites dans ${opts.out}\n`,
  );
}

main();
