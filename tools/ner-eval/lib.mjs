// Fonctions pures du spike S1 : étiquettes, reconstruction des positions, découpage,
// métriques, rendu Markdown. Aucune dépendance, aucun accès disque ni réseau :
// testables sans modèle (voir lib.test.mjs).
//
// Convention (CLAUDE.md R7) : toutes les positions sont des indices UTF-16
// (indices de chaîne JavaScript) sur le texte ORIGINAL, fin exclue.

export const TYPES = ["PERSON", "ORGANIZATION", "LOCATION"];

// ---------------------------------------------------------------------------
// 1. Étiquettes
// ---------------------------------------------------------------------------

const LABEL_MAP = new Map([
  ["PER", "PERSON"],
  ["PERS", "PERSON"],
  ["PERSON", "PERSON"],
  ["ORG", "ORGANIZATION"],
  ["ORGANIZATION", "ORGANIZATION"],
  ["ORGANISATION", "ORGANIZATION"],
  ["LOC", "LOCATION"],
  ["LOCATION", "LOCATION"],
  ["GPE", "LOCATION"],
]);

/** Retire un préfixe BIOES (B-, I-, E-, S-) d'une étiquette de modèle. */
export function stripPrefix(label) {
  return /^[BIES]-/.test(label) ? label.slice(2) : label;
}

/** Étiquette du modèle -> type Lessive, ou null (MISC, DATE, O, inconnu : ignoré). */
export function mapLabel(label) {
  if (typeof label !== "string") return null;
  return LABEL_MAP.get(stripPrefix(label).toUpperCase()) ?? null;
}

// ---------------------------------------------------------------------------
// 2. Normalisation avec table de positions
// ---------------------------------------------------------------------------

const PUNCT_FOLD = new Map([
  ["’", "'"],
  ["‘", "'"],
  ["ʼ", "'"],
  ["`", "'"],
  ["–", "-"],
  ["—", "-"],
  ["‑", "-"],
  ["‐", "-"],
]);

/**
 * Normalise pour la comparaison : sans espaces, sans diacritiques, en minuscules,
 * apostrophes et tirets unifiés. Retourne la chaîne normalisée et, pour chaque unité
 * normalisée, l'indice de début et de fin (exclu) dans l'original.
 */
export function normalizeWithMap(text) {
  let norm = "";
  const startMap = [];
  const endMap = [];
  let idx = 0;
  for (const ch of text) {
    const len = ch.length;
    if (!/\s/u.test(ch)) {
      const folded = PUNCT_FOLD.get(ch) ?? ch;
      const n = folded.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
      for (const unit of n) {
        // `for...of` itère par point de code ; on indexe par unité UTF-16.
        for (let k = 0; k < unit.length; k++) {
          norm += unit[k];
          startMap.push(idx);
          endMap.push(idx + len);
        }
      }
    }
    idx += len;
  }
  return { norm, startMap, endMap };
}

const WORD_CHAR = /[\p{L}\p{N}]/u;
const isWordChar = (c) => c !== undefined && WORD_CHAR.test(c);

// ---------------------------------------------------------------------------
// 3. Reconstruction des positions
// ---------------------------------------------------------------------------

/**
 * Regroupe des jetons bruts (aggregation_strategy "none") en entités.
 * Sert de repli si la version de Transformers.js ignore l'agrégation.
 * Jeton : { entity, word, score, index }. Retourne des groupes { entity_group, word, score }.
 * - un jeton B- ou d'un autre type ouvre un nouveau groupe ;
 * - un jeton non contigu (index ≠ précédent + 1) ouvre un nouveau groupe ;
 * - un jeton de continuation de mot ("##x") se rattache toujours au groupe précédent contigu.
 */
export function groupRawTokens(tokens) {
  const groups = [];
  let prev = null;
  let current = null;
  for (const t of tokens) {
    const tag = stripPrefix(t.entity);
    const isB = /^[BS]-/.test(t.entity);
    const contiguous = prev !== null && t.index === prev.index + 1;
    const isContinuationPiece = typeof t.word === "string" && t.word.startsWith("##");
    const extend =
      current !== null &&
      contiguous &&
      (isContinuationPiece || (!isB && current.tag === tag));
    const piece = isContinuationPiece ? t.word.slice(2) : t.word;
    if (extend) {
      current.word += isContinuationPiece ? piece : ` ${piece}`;
      current.scores.push(t.score);
    } else {
      current = { tag, word: piece, scores: [t.score], raw: t.entity };
      groups.push(current);
    }
    prev = t;
  }
  return groups.map((g) => ({
    entity_group: g.tag,
    word: g.word,
    score: g.scores.reduce((a, b) => a + b, 0) / g.scores.length,
  }));
}

/** Uniformise la sortie du pipeline : groupes avec entity_group. */
export function normalizePipelineOutput(items) {
  if (!Array.isArray(items) || items.length === 0) return [];
  if (items[0].entity_group === undefined && items[0].entity !== undefined) {
    return groupRawTokens(items);
  }
  return items;
}

/**
 * Reconstruit les positions des entités dans `text`.
 * `groups` : sortie du pipeline avec agrégation, dans l'ordre du texte :
 *   { entity_group | entity, word, score, start?, end? }.
 * - Si start/end sont fournis et cohérents avec le texte, ils sont utilisés (source "native").
 * - Sinon, `word` (décodé par le tokenizer, donc possiblement en casse/espacement altérés)
 *   est cherché à partir de la fin de la dernière entité trouvée, sur une copie normalisée
 *   (sans espaces, diacritiques ni casse), puis ramené aux indices de l'original.
 *   On préfère une occurrence alignée sur des frontières de mots (source "search"),
 *   sinon la première occurrence (source "approx").
 * Retourne { spans: [{start,end,type,score,source}], unlocated: n, ignored: n }.
 * `ignored` compte les groupes dont l'étiquette n'est pas PERSON/ORGANIZATION/LOCATION.
 */
export function reconstructSpans(text, groups) {
  const spans = [];
  let unlocated = 0;
  let ignored = 0;
  let cursorOrig = 0;
  let normed = null;

  for (const g of groups) {
    const type = mapLabel(g.entity_group ?? g.entity);
    if (type === null) {
      ignored++;
      continue;
    }
    const score = typeof g.score === "number" ? g.score : null;

    if (
      Number.isInteger(g.start) &&
      Number.isInteger(g.end) &&
      g.start >= 0 &&
      g.end > g.start &&
      g.end <= text.length
    ) {
      spans.push({ start: g.start, end: g.end, type, score, source: "native" });
      cursorOrig = g.end;
      continue;
    }

    normed ??= normalizeWithMap(text);
    const needle = normalizeWithMap(String(g.word ?? "")).norm;
    if (needle === "") {
      unlocated++;
      continue;
    }
    // Premier indice normalisé dont l'indice d'origine est >= cursorOrig.
    let from = normed.startMap.findIndex((o) => o >= cursorOrig);
    if (from === -1) from = normed.norm.length;

    let found = -1;
    let source = "search";
    let fallback = -1;
    for (let i = normed.norm.indexOf(needle, from); i !== -1; i = normed.norm.indexOf(needle, i + 1)) {
      const s = normed.startMap[i];
      const e = normed.endMap[i + needle.length - 1];
      const before = s > 0 ? text[s - 1] : undefined;
      const after = e < text.length ? text[e] : undefined;
      if (fallback === -1) fallback = i;
      if (!isWordChar(before) && !isWordChar(after)) {
        found = i;
        break;
      }
    }
    if (found === -1 && fallback !== -1) {
      found = fallback;
      source = "approx";
    }
    if (found === -1) {
      unlocated++;
      continue;
    }
    const start = normed.startMap[found];
    const end = normed.endMap[found + needle.length - 1];
    spans.push({ start, end, type, score, source });
    cursorOrig = end;
  }
  return { spans, unlocated, ignored };
}

// ---------------------------------------------------------------------------
// 4. Découpage des textes longs (le pipeline tronque à 512 jetons)
// ---------------------------------------------------------------------------

/**
 * Découpe `text` en morceaux d'au plus `maxChars` unités UTF-16, en coupant de préférence
 * après un espace. Les morceaux sont jointifs : text.slice(offset, offset + chunk.length).
 */
export function chunkText(text, maxChars = 1000) {
  const chunks = [];
  let i = 0;
  while (i < text.length) {
    let end = Math.min(i + maxChars, text.length);
    if (end < text.length) {
      let cut = -1;
      for (let j = end; j > i + Math.floor(maxChars / 2); j--) {
        if (/\s/u.test(text[j - 1])) {
          cut = j;
          break;
        }
      }
      if (cut !== -1) end = cut;
      else {
        const a = text.charCodeAt(end - 1);
        if (a >= 0xd800 && a <= 0xdbff) end--; // ne coupe pas une paire de substitution
      }
    }
    chunks.push({ offset: i, text: text.slice(i, end) });
    i = end;
  }
  return chunks;
}

/**
 * Prédit les entités d'un texte : découpage, classification de chaque morceau,
 * reconstruction des positions, décalage par l'offset du morceau.
 * `classify(chunkText)` retourne la sortie du pipeline (async).
 * Retourne { spans, unlocated, ignored, sources: {native, search, approx} }.
 */
export async function predictText(text, classify, { chunkSize = 1000 } = {}) {
  const spans = [];
  let unlocated = 0;
  let ignored = 0;
  const sources = { native: 0, search: 0, approx: 0 };
  for (const chunk of chunkText(text, chunkSize)) {
    const out = normalizePipelineOutput(await classify(chunk.text));
    const r = reconstructSpans(chunk.text, out);
    unlocated += r.unlocated;
    ignored += r.ignored;
    for (const s of r.spans) {
      sources[s.source]++;
      spans.push({ ...s, start: s.start + chunk.offset, end: s.end + chunk.offset });
    }
  }
  return { spans, unlocated, ignored, sources };
}

// ---------------------------------------------------------------------------
// 5. Métriques
// ---------------------------------------------------------------------------

const emptyCounts = () => ({ tp: 0, fp: 0, fn: 0 });

function overlapLen(a, b) {
  return Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start));
}

/** Appariement un-pour-un ; `exact` : mêmes bornes, sinon recouvrement non nul. Retourne tp. */
function matchCount(gold, pred, exact) {
  const used = new Set();
  let tp = 0;
  const sortedGold = [...gold].sort((a, b) => a.start - b.start);
  for (const g of sortedGold) {
    let best = -1;
    let bestLen = 0;
    pred.forEach((p, i) => {
      if (used.has(i)) return;
      if (exact) {
        if (p.start === g.start && p.end === g.end && bestLen === 0) {
          best = i;
          bestLen = 1;
        }
      } else {
        const len = overlapLen(g, p);
        if (len > bestLen) {
          best = i;
          bestLen = len;
        }
      }
    });
    if (best !== -1) {
      used.add(best);
      tp++;
    }
  }
  return tp;
}

/**
 * Compte tp/fp/fn pour une phrase. Clés : PERSON, ORGANIZATION, LOCATION,
 * ALL (somme des trois types) et ANY (insensible au type : détecté ou non).
 * `mode` : "exact" (mêmes bornes et même type) ou "overlap" (recouvrement et même type).
 */
export function scoreSentence(gold, pred, mode) {
  const exact = mode === "exact";
  const res = {};
  for (const t of TYPES) {
    const g = gold.filter((e) => e.type === t);
    const p = pred.filter((e) => e.type === t);
    const tp = matchCount(g, p, exact);
    res[t] = { tp, fp: p.length - tp, fn: g.length - tp };
  }
  res.ALL = TYPES.reduce(
    (a, t) => ({ tp: a.tp + res[t].tp, fp: a.fp + res[t].fp, fn: a.fn + res[t].fn }),
    emptyCounts(),
  );
  const g = gold.filter((e) => TYPES.includes(e.type));
  const p = pred.filter((e) => TYPES.includes(e.type));
  const tp = matchCount(g, p, exact);
  res.ANY = { tp, fp: p.length - tp, fn: g.length - tp };
  return res;
}

export function addCounts(a, b) {
  const out = {};
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const x = a[k] ?? emptyCounts();
    const y = b[k] ?? emptyCounts();
    out[k] = { tp: x.tp + y.tp, fp: x.fp + y.fp, fn: x.fn + y.fn };
  }
  return out;
}

/** Précision, rappel, F1 à partir de tp/fp/fn. null quand le dénominateur est nul. */
export function prf({ tp, fp, fn }) {
  const precision = tp + fp === 0 ? null : tp / (tp + fp);
  const recall = tp + fn === 0 ? null : tp / (tp + fn);
  const f1 =
    precision === null || recall === null || precision + recall === 0
      ? precision === null && recall === null
        ? null
        : 0
      : (2 * precision * recall) / (precision + recall);
  return { precision, recall, f1, tp, fp, fn, support: tp + fn };
}

/**
 * Score un ensemble de phrases. rows : [{ id, entities }], predsById : Map id -> spans.
 * Retourne { exact: {clé: prf}, overlap: {clé: prf} }.
 */
export function scoreRows(rows, predsById) {
  const total = { exact: {}, overlap: {} };
  for (const row of rows) {
    const pred = predsById.get(row.id) ?? [];
    for (const mode of ["exact", "overlap"]) {
      total[mode] = addCounts(total[mode], scoreSentence(row.entities, pred, mode));
    }
  }
  const out = { exact: {}, overlap: {} };
  for (const mode of ["exact", "overlap"]) {
    for (const k of [...TYPES, "ALL", "ANY"]) out[mode][k] = prf(total[mode][k] ?? emptyCounts());
  }
  return out;
}

// ---------------------------------------------------------------------------
// 6. Statistiques et rendu
// ---------------------------------------------------------------------------

export const mean = (xs) => (xs.length === 0 ? null : xs.reduce((a, b) => a + b, 0) / xs.length);

export function percentile(xs, p) {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const i = Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1));
  return s[i];
}

const f2 = (x) => (x === null || x === undefined ? "–" : x.toFixed(3));
const ms = (x) => (x === null || x === undefined ? "–" : `${x.toFixed(1)} ms`);
const mb = (bytes) => (bytes === null || bytes === undefined ? "–" : `${(bytes / 1e6).toFixed(1)} Mo`);

function prfTable(scores) {
  const rows = [...TYPES, "ALL", "ANY"];
  const lines = [
    "| Catégorie | P exact | R exact | F1 exact | P recouvr. | R recouvr. | F1 recouvr. | Support |",
    "|---|---|---|---|---|---|---|---|",
  ];
  for (const k of rows) {
    const e = scores.exact[k];
    const o = scores.overlap[k];
    const label = k === "ALL" ? "Tous types (micro)" : k === "ANY" ? "Détection sans égard au type" : k;
    lines.push(
      `| ${label} | ${f2(e.precision)} | ${f2(e.recall)} | ${f2(e.f1)} | ${f2(o.precision)} | ${f2(o.recall)} | ${f2(o.f1)} | ${e.support} |`,
    );
  }
  return lines.join("\n");
}

/** Rend le rapport complet d'un modèle en Markdown. Fonction pure. */
export function renderReport(r) {
  const out = [];
  out.push(`# Résultats NER — ${r.model}`);
  out.push("");
  out.push(
    `Généré le ${r.date} · Transformers.js ${r.env.transformers} · Node ${r.env.node} · ${r.env.cpu} (${r.env.cores} cœurs) · dtype \`${r.dtype}\``,
  );
  out.push("");
  out.push("Mesures faites sous Node (onnxruntime-node, CPU). Elles ne remplacent pas la mesure navigateur (WASM).");
  out.push("");
  out.push("## Performance");
  out.push("");
  out.push("| Mesure | Valeur |");
  out.push("|---|---|");
  out.push(`| Temps de chargement | ${ms(r.perf.loadMs)} |`);
  out.push(`| Temps moyen par phrase (${r.perf.sentences} phrases) | ${ms(r.perf.meanSentenceMs)} |`);
  out.push(`| Temps p95 par phrase | ${ms(r.perf.p95SentenceMs)} |`);
  out.push(
    `| Texte de ${r.perf.longChars} caractères (${r.perf.longChunks} morceaux), médiane de ${r.perf.longRuns} essais | ${ms(r.perf.longMedianMs)} (min ${ms(r.perf.longMinMs)}) |`,
  );
  out.push(`| Mémoire RSS avant chargement | ${mb(r.perf.rssBefore)} |`);
  out.push(`| Mémoire RSS après chargement | ${mb(r.perf.rssAfterLoad)} |`);
  out.push(`| Pic de mémoire RSS pendant l'inférence | ${mb(r.perf.rssPeak)} |`);
  out.push(`| Fichier de poids utilisé | \`${r.size.weightsFile}\` — ${mb(r.size.weightsBytes)} |`);
  out.push(`| Fichiers nécessaires (poids + tokenizer + config) | ${mb(r.size.neededBytes)} |`);
  out.push(`| Dossier complet du modèle | ${mb(r.size.totalBytes)} |`);
  out.push("");
  out.push("## Qualité");
  out.push("");
  out.push(
    "Exact : mêmes bornes et même type. Recouvrement : intervalles qui se recouvrent, même type. " +
      "Appariement un-pour-un. ANY : le type est ignoré (utile pour le masquage).",
  );
  for (const lang of Object.keys(r.byLang)) {
    out.push("");
    out.push(`### Langue : ${lang}`);
    out.push("");
    out.push(prfTable(r.byLang[lang]));
  }
  out.push("");
  out.push("### Rappel par type de phrase (recouvrement, tous types)");
  out.push("");
  out.push("| Langue | Type de phrase | Entités | Rappel | Précision |");
  out.push("|---|---|---|---|---|");
  for (const lang of Object.keys(r.byTag)) {
    for (const [tag, s] of Object.entries(r.byTag[lang])) {
      out.push(`| ${lang} | ${tag} | ${s.overlap.ALL.support} | ${f2(s.overlap.ALL.recall)} | ${f2(s.overlap.ALL.precision)} |`);
    }
  }
  out.push("");
  out.push("## Reconstruction des positions");
  out.push("");
  const rc = r.reconstruction;
  out.push(
    `Entités prédites par source : natives ${rc.native}, retrouvées par recherche ${rc.search}, ` +
      `approximatives ${rc.approx} ; non localisées ${rc.unlocated} ; étiquettes ignorées (MISC, etc.) ${rc.ignored}.`,
  );
  out.push("");
  out.push("## Critères de l'ADR 0001");
  out.push("");
  const t = r.criteria;
  out.push("| Critère | Cible | Mesuré | Atteint |");
  out.push("|---|---|---|---|");
  out.push(`| Poids du modèle | ≤ 150 Mo | ${mb(r.size.neededBytes)} | ${t.size} |`);
  out.push(`| Rappel PERSON en français (recouvrement) | ≥ 0,85 | ${f2(t.personRecallFr)} | ${t.recall} |`);
  out.push(`| Texte de 5000 caractères | ≤ 5 s | ${ms(r.perf.longMedianMs)} | ${t.time} |`);
  out.push("| Licence redistribuable compatible Apache 2.0 | oui | à vérifier à la main | – |");
  out.push("");
  return out.join("\n");
}

/** Évalue les trois critères mesurables de l'acceptation S1. */
export function evaluateCriteria({ neededBytes, personRecallFr, longMedianMs }) {
  const yn = (b) => (b ? "oui" : "non");
  return {
    personRecallFr,
    size: yn(neededBytes <= 150e6),
    recall: personRecallFr === null ? "–" : yn(personRecallFr >= 0.85),
    time: yn(longMedianMs <= 5000),
  };
}

/** Texte de longueur voulue obtenu en concaténant des phrases (coupé sur un espace). */
export function buildLongText(texts, minChars) {
  let out = "";
  for (let i = 0; out.length < minChars + 200 && texts.length > 0; i++) {
    out += (out ? " " : "") + texts[i % texts.length];
  }
  let cut = minChars;
  const a = out.charCodeAt(cut - 1);
  if (a >= 0xd800 && a <= 0xdbff) cut--;
  return out.slice(0, cut);
}
