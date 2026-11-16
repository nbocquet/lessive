// S2 — Analyseur tolérant de jetons (fonction pure, sans dépendance).
//
// Retrouve, dans un texte produit par un LLM, les jetons de pseudonymisation et leurs
// variantes courantes. Les positions sont des indices UTF-16 sur le texte analysé (R7).
//
//   analyze(text, { format, table }) -> { matches, unknown, found }
//   reidentify(text, { format, table }) -> { text, replaced, unknown }
//   findStrict(text, { format, table }) -> Map(jeton -> nombre d'occurrences exactes)
//
// `table` : { "PERSONNE_001": "Claire Martin", ... } (les clés sont les jetons canoniques
// du format ; seules les clés servent à l'analyse).
//
// Variantes reconnues (formats A et B) : casse, espace / tiret / `\_` à la place du tiret bas,
// zéros de tête absents ou en trop, crochets (avec ou sans échappement markdown) ajoutés,
// modifiés ou retirés, décorations markdown (laissées en place), type traduit en anglais,
// possessif ou pluriel anglais accolé, jeton coupé par UN retour à la ligne.
// Variantes reconnues (format C) : délimiteurs ⟦ ⟧ remplacés par [[ ]], [ ], 〚 〛…,
// délimiteur unique si c'est un caractère rare, casse, zéros, séparateur, espaces internes.
//
// Garde-fous : un jeton n'est jamais pris à l'intérieur d'un autre mot ; PERSONNE_1 et
// PERSONNE_10 sont distingués ; une forme « espace seul » exige le type en majuscules
// (pour ne pas confondre avec « la personne 2 »).

import { getFormat, TYPE_INFO } from "./formats.mjs";

// ---------------------------------------------------------------------------
// Briques communes
// ---------------------------------------------------------------------------

const WS = "[ \\t\\u00a0\\u202f]";
const SPACE = `(?:${WS}+|${WS}*\\r?\\n${WS}*)`; // espaces, ou un seul retour à la ligne
const DASH = "\\\\?[_\\-\\u2010-\\u2015\\u2212]"; // _ - ‐ – — − , éventuellement échappé par \
const SEP = `(?:(?:${SPACE})?${DASH}(?:${SPACE})?|${SPACE})`;

// Mots de type reconnus pour les formats A et B : français et traductions anglaises.
const WORD_TO_TYPE = {
  PERSONNE: "PERSON",
  PERSON: "PERSON",
  ORGANISATION: "ORGANIZATION",
  ORGANIZATION: "ORGANIZATION",
  LIEU: "LOCATION",
  LOCATION: "LOCATION",
  PLACE: "LOCATION",
  EMAIL: "EMAIL",
  COURRIEL: "EMAIL",
  TELEPHONE: "PHONE",
  PHONE: "PHONE",
  IBAN: "IBAN",
  AVS: "CH_AVS",
  AHV: "CH_AVS",
  OASI: "CH_AVS",
};
const WORD_ALTERNATION =
  "PERSONNE|PERSON|ORGANISATION|ORGANIZATION|LIEU|LOCATION|PLACE|E-?MAIL|COURRIEL|" +
  "T[ÉE]L[ÉE]PHONE|PHONE|IBAN|AVS|AHV|OASI";

const WORD_RE_SOURCE = `(${WORD_ALTERNATION})(${SEP})(\\d+)`;

const isWordChar = (ch) => ch !== undefined && /[\p{L}\p{N}]/u.test(ch);

function normalizeWord(word) {
  return word
    .toUpperCase()
    .normalize("NFD")
    .replace(/[̀-ͯ-]/g, "");
}

/** Frontière gauche : pas de lettre/chiffre avant (les `_` markdown éventuels sont franchis). */
function leftOk(text, i) {
  let j = i - 1;
  while (j >= 0 && text[j] === "_") j--;
  return !(j >= 0 && isWordChar(text[j]));
}

/** Frontière droite : pas de lettre/chiffre après (les `_` markdown éventuels sont franchis). */
function rightOk(text, i) {
  const n = text[i];
  if (n === undefined) return true;
  if (isWordChar(n)) return false;
  if (n === "_") {
    let j = i;
    while (text[j] === "_") j++;
    return !isWordChar(text[j]);
  }
  return true;
}

const SUFFIX_RE = /^(?:(['’]s)|(s))(?![\p{L}\p{N}])/iu;

/** Possessif (`'s`) ou pluriel (`s`) anglais accolé à la fin d'un jeton. */
function suffixAt(text, i) {
  const m = SUFFIX_RE.exec(text.slice(i, i + 4));
  if (!m) return null;
  return m[1] ? "possessive" : "plural";
}

// Crochets réellement « autour » d'un jeton : on les avale dans la correspondance
// seulement s'ils sont en nombre égal et de la même famille de chaque côté.
const OPEN_RE = /((?:\\?\[)+|\\?\{|⟦|〚)[ \t]*$/u;
const CLOSE_RE = /^[ \t]*((?:\\?\])+|\\?\}|⟧|〛)/u;
const FAMILY = { "[": "[", "{": "{", "⟦": "⟦", "〚": "〚" };
const CLOSER_FAMILY = { "]": "[", "}": "{", "⟧": "⟦", "〛": "〚" };

function openerFamily(s) {
  const bare = s.replace(/\\/g, "");
  return { family: FAMILY[bare[0]], count: bare.length };
}
function closerFamily(s) {
  const bare = s.replace(/\\/g, "");
  return { family: CLOSER_FAMILY[bare[0]], count: bare.length };
}

/** Renvoie `{ start, end, open, close }` si le cœur [start, end) est entouré de crochets appariés. */
function wrapAround(text, start, end) {
  const before = OPEN_RE.exec(text.slice(Math.max(0, start - 16), start));
  const after = CLOSE_RE.exec(text.slice(end, end + 16));
  if (!before || !after) return null;
  const o = openerFamily(before[1]);
  const c = closerFamily(after[1]);
  if (o.family !== c.family || o.count !== c.count) return null;
  return {
    start: start - before[0].length,
    end: end + after[0].length,
    open: before[1],
    close: after[1],
  };
}

function decorationOf(text, start, end) {
  const a = text[start - 1];
  const b = text[end];
  const deco = new Set(["*", "`", "_", '"', "'", "«", "»", "“", "”", "‘", "’"]);
  return a !== undefined && b !== undefined && deco.has(a) && deco.has(b);
}

/** Construit l'index `type:numéro -> jeton canonique` depuis la table, ou lève une erreur. */
function buildIndex(format, table) {
  const index = new Map();
  for (const token of Object.keys(table)) {
    const parsed = format.parse(token);
    if (!parsed) {
      throw new Error(`Jeton « ${token} » invalide pour le format ${format.id}`);
    }
    index.set(`${parsed.type}:${parsed.number}`, token);
  }
  return index;
}

// ---------------------------------------------------------------------------
// Formats A et B : type en toutes lettres + numéro
// ---------------------------------------------------------------------------

function scanWordFormat(text, format, index) {
  const matches = [];
  const unknown = [];
  const re = new RegExp(WORD_RE_SOURCE, "giu");

  for (const m of text.matchAll(re)) {
    const [core, word, sep, digits] = m;
    const coreStart = m.index;
    const coreEnd = coreStart + core.length;
    const type = WORD_TO_TYPE[normalizeWord(word)];
    if (!type) continue;
    const number = Number(digits);

    const allCaps = word === word.toUpperCase();
    const hasUnderscore = sep.includes("_");
    const hasSpace = /\s/.test(sep);
    const isDash = !hasUnderscore && /[-‐-―−]/.test(sep);
    // Règle anti faux positifs : « la personne 2 », « lieu - 2024 », « Person 1 »…
    const knownOk = hasUnderscore || (isDash ? allCaps || !hasSpace : allCaps);
    const unknownOk = hasUnderscore || (allCaps && digits.length > 1 && digits[0] === "0");

    const token = index.get(`${type}:${number}`);
    if (token ? !knownOk : !unknownOk) continue;

    // Crochets autour, frontières, suffixe anglais.
    const wrap = wrapAround(text, coreStart, coreEnd);
    let start = coreStart;
    let end = coreEnd;
    if (wrap) {
      start = wrap.start;
      end = wrap.end;
    } else if (!leftOk(text, coreStart)) {
      continue;
    }
    let suffix = suffixAt(text, end);
    if (!wrap && !suffix && !rightOk(text, end)) continue;

    const variants = [];
    if (!allCaps) variants.push("case");
    if (normalizeWord(word) !== TYPE_INFO[type].prefix) variants.push("translated");
    if (sep.includes("\\")) variants.push("escaped-separator");
    else if (!hasUnderscore || /[ \t\u00a0\u202f]/.test(sep)) variants.push("separator");
    if (/\n/.test(sep)) variants.push("linebreak");
    if (token && digits !== format.digits(number)) variants.push("zeros");
    if (format.id === "B") {
      if (!wrap) variants.push("brackets-missing");
      else if (wrap.open !== "[" || wrap.close !== "]") variants.push("brackets-changed");
    } else if (wrap) {
      variants.push("brackets-added");
    }
    if (!wrap && decorationOf(text, start, end)) variants.push("decorated");
    if (suffix) variants.push(suffix);

    const base = { start, end, coreStart, coreEnd, text: text.slice(start, end), type, number };
    if (token) matches.push({ ...base, token, variants, suffix });
    else unknown.push({ ...base, variants, suffix });
  }
  return { matches, unknown };
}

// ---------------------------------------------------------------------------
// Format C : ⟦P1⟧
// ---------------------------------------------------------------------------

const SHORT_OPEN = "(?:\\\\?\\[){1,2}|⟦|〚|⟪|\\\\?\\{";
const SHORT_CLOSE = "(?:\\\\?\\]){1,2}|⟧|〛|⟫|\\\\?\\}";
const SHORT_RE_SOURCE =
  `(?:(${SHORT_OPEN})${WS}*)?([A-Za-z]{1,2})(${WS}*[_\\-]?${WS}*)(\\d+)` +
  `(?:${WS}*(${SHORT_CLOSE}))?`;
const STRONG = new Set(["⟦", "〚", "⟪", "⟧", "〛", "⟫"]);
const SHORT_LETTER_TO_TYPE = Object.fromEntries(
  Object.entries(TYPE_INFO).map(([type, info]) => [info.short, type]),
);

function scanShortFormat(text, format, index) {
  const matches = [];
  const unknown = [];
  const re = new RegExp(SHORT_RE_SOURCE, "gu");

  for (const m of text.matchAll(re)) {
    const [whole, open, letters, sep, digits, close] = m;
    if (!open && !close) continue; // « P1 » seul : trop ambigu
    // Un seul délimiteur : accepté seulement si c'est un caractère rare.
    if (!open !== !close && !STRONG.has((open ?? close).replace(/\\/g, "")[0])) continue;
    const strongDelimiter =
      (open && STRONG.has(open.replace(/\\/g, "")[0])) ||
      (close && STRONG.has(close.replace(/\\/g, "")[0]));

    const type = SHORT_LETTER_TO_TYPE[letters.toUpperCase()];
    const number = Number(digits);
    const token = type ? index.get(`${type}:${number}`) : undefined;
    // Inconnu : lettre du format, ou n'importe quelle lettre si le délimiteur est rare.
    if (!token && !(type || strongDelimiter)) continue;

    const start = m.index;
    const end = start + whole.length;
    const variants = [];
    if (letters !== letters.toUpperCase()) variants.push("case");
    if (/^0\d/.test(digits)) variants.push("zeros");
    if (sep) variants.push("separator");
    if (open !== "⟦" || close !== "⟧") {
      variants.push(open && close ? "delimiters-changed" : "delimiter-partial");
    }
    const inner = whole.slice(open ? open.length : 0, whole.length - (close ? close.length : 0));
    if (/^\s|\s$/.test(inner)) variants.push("spaces");
    const suffix = suffixAt(text, end);
    if (suffix) variants.push(suffix);

    const base = { start, end, coreStart: start, coreEnd: end, text: whole, type, number };
    if (token) matches.push({ ...base, token, variants, suffix });
    else unknown.push({ ...base, variants, suffix });
  }
  return { matches, unknown };
}

// ---------------------------------------------------------------------------
// API publique
// ---------------------------------------------------------------------------

/**
 * @param {string} text Texte à analyser (réponse d'un LLM).
 * @param {{ format: "A"|"B"|"C", table: Record<string,string> }} options
 * @returns {{
 *   matches: Array<{ start:number, end:number, coreStart:number, coreEnd:number, text:string,
 *                    token:string, type:string, number:number, variants:string[],
 *                    suffix:(null|"possessive"|"plural") }>,
 *   unknown: Array<{ start:number, end:number, text:string, type:(string|undefined),
 *                    number:number, variants:string[] }>,
 *   found: string[]
 * }}
 */
export function analyze(text, { format: formatId, table }) {
  const format = getFormat(formatId);
  const index = buildIndex(format, table);
  const { matches, unknown } =
    format.kind === "word"
      ? scanWordFormat(text, format, index)
      : scanShortFormat(text, format, index);
  matches.sort((a, b) => a.start - b.start);
  unknown.sort((a, b) => a.start - b.start);
  const found = [...new Set(matches.map((m) => m.token))];
  return { matches, unknown, found };
}

/**
 * Remplace chaque correspondance par sa valeur. Les jetons inconnus sont laissés tels quels.
 * Les décorations markdown et le suffixe anglais (`'s`) restent en place.
 */
export function reidentify(text, { format, table }) {
  const { matches, unknown } = analyze(text, { format, table });
  let out = "";
  let cursor = 0;
  for (const m of matches) {
    if (m.start < cursor) continue; // garde-fou : ne devrait pas arriver
    out += text.slice(cursor, m.start) + table[m.token];
    cursor = m.end;
  }
  out += text.slice(cursor);
  return { text: out, replaced: matches.length, unknown };
}

/**
 * Occurrences EXACTES (forme canonique, frontières de mots respectées) des jetons de la table.
 * Sert de référence « strict » pour le score.
 */
export function findStrict(text, { format: formatId, table }) {
  const format = getFormat(formatId);
  buildIndex(format, table); // valide les clés
  const counts = new Map();
  for (const token of Object.keys(table)) {
    const needsLeft = /^[\p{L}\p{N}]/u.test(token);
    const needsRight = /[\p{L}\p{N}]$/u.test(token);
    let from = 0;
    let n = 0;
    for (;;) {
      const i = text.indexOf(token, from);
      if (i < 0) break;
      from = i + 1;
      const j = i + token.length;
      if (needsLeft && isWordChar(text[i - 1])) continue;
      if (needsRight && isWordChar(text[j])) continue;
      n++;
    }
    if (n > 0) counts.set(token, n);
  }
  return counts;
}
