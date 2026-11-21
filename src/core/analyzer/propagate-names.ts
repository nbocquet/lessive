/**
 * Propagation des noms de personne (étape de l'analyseur).
 *
 * Problème : un prénom seul (« Sophie ») est volontairement sous le seuil, et un identifiant de
 * connexion (« CMARTIN ») n'est dans aucun dictionnaire. Quand la même personne est détectée
 * ailleurs en nom complet (« Sophie Durand »), ces formes restaient en clair.
 *
 * Principe : on collecte les noms « sûrs » (détection PERSON au-dessus du seuil, avec au moins
 * deux mots, ou titre + nom, ou NER ≥ 0,8, ou ajout manuel ; plus `knownPersons`, formes connues
 * d'avance), on en dérive des formes de recherche, puis on les cherche en UNE passe dans tout le
 * texte. Chaque occurrence non déjà couverte donne une détection PERSON.
 *
 * Formes générées pour « Jean-Pierre Lambert » :
 *  - nom : « Lambert », « Jean-Pierre Lambert », « Lambert Jean-Pierre » ;
 *  - prénom : « Jean-Pierre » (le prénom composé en entier, jamais « Jean » seul) ;
 *  - identifiants : jplambert, lambertjp, jp.lambert, jean-pierre.lambert, jean-pierre_lambert,
 *    jean-pierre-lambert, jean-pierrelambert, jeanpierre.lambert, jeanpierrelambert, lambert.jean-pierre…
 * Particules : pour « de La Tour », « de La Tour » et « La Tour ».
 *
 * Recherche : texte normalisé en une copie (minuscules, sans accents, espaces fusionnées), avec
 * tables de positions vers le texte original (R7) ; index des formes par premier caractère ;
 * limites de mots Unicode. Le point, le tiret bas et le tiret relient deux mots seulement s'ils
 * touchent une lettre ou un chiffre de l'autre côté (« CMARTIN. » en fin de phrase est pris,
 * « cmartin.exemple » ne l'est pas).
 *
 * Garde-fous : un prénom seul exige une majuscule initiale ; s'il est ambigu (« Pierre », « Rose »…),
 * il n'est propagé que depuis un nom complet vu dans le texte, et jamais juste après une fin de phrase ; un nom de famille ambigu (règle `noms-famille-ambigus`) exige la
 * majuscule. Aucune occurrence n'est produite sur une détection déjà retenue au-dessus du seuil
 * (EMAIL, URL, même personne…) ni sur un ajout manuel.
 *
 * Les explications ne citent jamais la valeur (R5).
 */
import {
  derivedPersonIdentifiers,
  familyNameVariants,
  isPersonNameParticle,
} from "../mapping/person-identifiers.ts";
import { normalizeForm } from "../mapping/index.ts";
import type { ActiveRule } from "../registry/index.ts";
import type { AnalysisContext, Detection } from "../types/index.ts";

export const PROPAGATION_RECOGNIZER_ID = "core/name-propagation";
export const PROPAGATION_PACK_ID = "core";
/** Score d'un nom de famille, d'un nom complet ou d'un identifiant dérivé. */
export const PROPAGATED_NAME_SCORE = 0.85;
/** Score d'un prénom seul. */
export const PROPAGATED_GIVEN_NAME_SCORE = 0.75;
/** Score NER minimal pour qu'un nom d'un seul mot soit « sûr ». */
export const SAFE_NER_SCORE = 0.8;

const EXPLAIN_NAME = "forme d'un nom détecté ailleurs dans le texte";
const EXPLAIN_ID = "identifiant dérivé d'un nom détecté";

export interface PropagateOptions {
  /** Seuil de l'analyse : un nom n'est « sûr » que s'il le dépasse. */
  minScore: number;
  /** Formes de surface connues d'avance (entités PERSON de la session). */
  knownPersons?: readonly string[];
  /** Prénoms ambigus (comparés sans casse ni accents) : jamais propagés seuls. */
  ambiguousGivenNames?: ReadonlySet<string>;
  /** Noms de famille ambigus : propagés seulement avec une majuscule initiale. */
  ambiguousFamilyNames?: ReadonlySet<string>;
}

// ---------------------------------------------------------------------------
// Ambigus
// ---------------------------------------------------------------------------

/** Règles du pack lang-fr-en qui listent les termes ambigus. */
const AMBIGUOUS_GIVEN_RULE = "prenoms-ambigus";
const AMBIGUOUS_FAMILY_RULE = "noms-famille-ambigus";

/** Lit les termes ambigus dans les règles de dictionnaire PERSON (formes repliées). */
export function collectAmbiguousNames(rules: readonly ActiveRule[]): {
  given: Set<string>;
  family: Set<string>;
} {
  const given = new Set<string>();
  const family = new Set<string>();
  for (const { rule } of rules) {
    if (rule.kind !== "dictionary" || rule.entityType !== "PERSON") continue;
    const target =
      rule.id === AMBIGUOUS_GIVEN_RULE
        ? given
        : rule.id === AMBIGUOUS_FAMILY_RULE
          ? family
          : undefined;
    if (!target) continue;
    for (const t of rule.terms) target.add(foldString(t));
  }
  return { given, family };
}

// ---------------------------------------------------------------------------
// Normalisation avec positions
// ---------------------------------------------------------------------------

function foldChar(ch: string): string {
  const c = ch.charCodeAt(0);
  if (c < 128) return c >= 65 && c <= 90 ? String.fromCharCode(c + 32) : ch;
  if (ch === "’" || ch === "‘" || ch === "ʼ" || ch === "`") return "'";
  const base = ch.normalize("NFD")[0] as string;
  const lower = base.toLowerCase();
  return lower.length === 1 ? lower : (lower[0] as string);
}

/** Replie une chaîne comme le texte : minuscules, sans accents, un code point → un caractère. */
function foldString(s: string): string {
  let out = "";
  for (const cp of s) out += cp.length > 1 ? "�" : foldChar(cp);
  return out;
}

const MARK = /\p{M}/u;
const LETTER = /\p{L}/u;
const DIGIT = /\p{N}/u;

function isWordChar(ch: string): boolean {
  const c = ch.charCodeAt(0);
  if (c < 128) return (c >= 97 && c <= 122) || (c >= 48 && c <= 57) || (c >= 65 && c <= 90);
  return LETTER.test(ch) || DIGIT.test(ch);
}

const isJoiner = (ch: string): boolean => ch === "." || ch === "_" || ch === "-";
const isHSpace = (c: number): boolean =>
  c === 32 || c === 9 || c === 0xa0 || c === 0x202f || c === 0x2009;

interface Normalized {
  norm: string;
  /** Position de début, dans le texte original, du caractère normalisé k. */
  start: Int32Array;
  /** Position de fin (exclue) dans le texte original. */
  end: Int32Array;
}

/**
 * Copie normalisée : minuscules, sans accents, signes diacritiques absorbés, suites d'espaces
 * horizontales fusionnées, hors-BMP remplacés par U+FFFD. Chaque caractère de la copie garde son
 * intervalle d'origine : les positions restent des unités UTF-16 du texte non modifié (R7).
 */
function normalizeWithMap(text: string): Normalized {
  const n = text.length;
  const chars: string[] = [];
  const start = new Int32Array(n);
  const end = new Int32Array(n);
  let k = 0;
  for (let i = 0; i < n;) {
    const code = text.charCodeAt(i);
    const isHigh = code >= 0xd800 && code <= 0xdbff && i + 1 < n;
    const len = isHigh && (text.charCodeAt(i + 1) & 0xfc00) === 0xdc00 ? 2 : 1;
    const ch = len === 2 ? "" : (text[i] as string);
    if (len === 1 && code >= 0x300 && MARK.test(ch)) {
      if (k > 0) end[k - 1] = i + 1;
    } else if (len === 1 && isHSpace(code)) {
      if (k > 0 && chars[k - 1] === " ") end[k - 1] = i + 1;
      else {
        chars.push(" ");
        start[k] = i;
        end[k] = i + 1;
        k++;
      }
    } else {
      chars.push(len === 2 ? "�" : foldChar(ch));
      start[k] = i;
      end[k] = i + len;
      k++;
    }
    i += len;
  }
  return { norm: chars.join(""), start, end };
}

// ---------------------------------------------------------------------------
// Noms sûrs
// ---------------------------------------------------------------------------

const TITLE_WORDS = new Set([
  "m",
  "mm",
  "mr",
  "mme",
  "mmes",
  "mlle",
  "mlles",
  "mrs",
  "ms",
  "mx",
  "dr",
  "dre",
  "pr",
  "prof",
  "me",
  "miss",
  "sir",
  "monsieur",
  "messieurs",
  "madame",
  "mesdames",
  "mademoiselle",
  "maitre",
  "docteur",
  "docteure",
  "professeur",
  "professeure",
]);

/** Jetons normalisés valides : lettres, apostrophe, tiret ; au plus 6 mots. */
const NAME_TOKEN = /^\p{L}[\p{L}'-]*$/u;

function letterCount(s: string): number {
  let c = 0;
  for (const ch of s) if (LETTER.test(ch)) c++;
  return c;
}

function precededByTitle(text: string, start: number): boolean {
  const before = foldString(text.slice(Math.max(0, start - 24), start));
  const m = /(?:^|[^\p{L}\p{N}])(\p{L}+)\.?[ \t\u00a0\u202f]{1,2}$/u.exec(before);
  return m !== null && TITLE_WORDS.has(m[1] as string);
}

function startsWithTitle(raw: string): boolean {
  const m = /^\s*(\p{L}+)\.?\s+\S/u.exec(foldString(raw));
  return m !== null && TITLE_WORDS.has(m[1] as string);
}

interface ParsedName {
  /** Prénoms (jetons normalisés, un prénom composé reste un jeton). */
  given: string[];
  /** Mots du nom de famille, particules comprises. */
  family: string[];
  /** Nom d'un seul mot sans rôle connu. */
  single?: string;
  /** Mot unique écrit tout en capitales (« CMARTIN ») : proche d'un identifiant, la casse ne compte pas. */
  allCaps?: boolean;
}

function parseName(raw: string, titled: boolean): ParsedName | undefined {
  const key = normalizeForm(raw, "PERSON");
  const tokens = key.split(" ").filter((t) => t.length > 0);
  if (tokens.length === 0 || tokens.length > 6) return undefined;
  if (!tokens.every((t) => NAME_TOKEN.test(t))) return undefined;
  if (tokens.every((t) => isPersonNameParticle(t))) return undefined;
  const p = tokens.findIndex(isPersonNameParticle);
  if (p === 0) return { given: [], family: tokens };
  if (p > 0) return { given: tokens.slice(0, p), family: tokens.slice(p) };
  if (tokens.length === 1) {
    if (titled) return { given: [], family: tokens };
    const allCaps = raw === raw.toUpperCase() && raw !== raw.toLowerCase() && letterCount(raw) >= 4;
    return { given: [], family: [], single: tokens[0], allCaps };
  }
  return { given: tokens.slice(0, -1), family: [tokens[tokens.length - 1] as string] };
}

// ---------------------------------------------------------------------------
// Formes de recherche
// ---------------------------------------------------------------------------

type FormKind = "name" | "given" | "id";

interface Form {
  text: string;
  kind: FormKind;
  score: number;
  capital: boolean;
  /** Refusée juste après une fin de phrase (« . », « ! », « ? ») : prénom ambigu (« Claire »). */
  midSentence: boolean;
}

class FormSet {
  readonly forms = new Map<string, Form>();

  add(rawText: string, kind: FormKind, capital: boolean, midSentence = false): void {
    const text = foldString(rawText);
    if (text.length < 3) return;
    const score = kind === "given" ? PROPAGATED_GIVEN_NAME_SCORE : PROPAGATED_NAME_SCORE;
    const cur = this.forms.get(text);
    if (!cur) {
      this.forms.set(text, { text, kind, score, capital, midSentence });
      return;
    }
    cur.midSentence = cur.midSentence || midSentence;
    // Même forme pour deux noms : on garde le plus fort score, la majuscule reste exigée si l'un l'exige.
    if (score > cur.score) {
      cur.score = score;
      cur.kind = kind;
    }
    cur.capital = cur.capital || capital;
  }
}

interface Ambiguity {
  given: ReadonlySet<string>;
  family: ReadonlySet<string>;
}

/** Vrai si la position suit une fin de phrase sur la même ligne (espaces ignorées). */
function followsSentenceEnd(text: string, pos: number): boolean {
  for (let k = pos - 1; k >= 0; k--) {
    const c = text[k] as string;
    if (c === "\n") return false;
    if (/\s/u.test(c)) continue;
    return c === "." || c === "!" || c === "?" || c === "…";
  }
  return false;
}

function addName(forms: FormSet, parsed: ParsedName, amb: Ambiguity): void {
  const { given, family, single } = parsed;
  const ambiguous = (set: ReadonlySet<string>, form: string): boolean => set.has(foldString(form));

  if (single !== undefined) {
    if (
      letterCount(single) >= 3 &&
      !ambiguous(amb.given, single) &&
      !ambiguous(amb.family, single)
    ) {
      // Un mot tout en capitales est proche d'un identifiant : pas d'exigence de majuscule initiale.
      forms.add(single, "given", parsed.allCaps !== true);
    }
    return;
  }

  const variants = familyNameVariants(family);
  for (const v of variants) forms.add(v, "name", ambiguous(amb.family, v));

  const g0 = given[0];
  if (g0 !== undefined) {
    const allGiven = given.join(" ");
    // Un prénom ambigu (« Claire », « Rose ») est propagé quand son nom complet est vu dans le texte,
    // mais seulement avec une majuscule et hors début de phrase (« Claire et nette » reste intact).
    if (letterCount(g0) >= 3) forms.add(g0, "given", true, ambiguous(amb.given, g0));
    if (given.length > 1) forms.add(allGiven, "given", true, ambiguous(amb.given, allGiven));
    // Noms complets, dans les deux ordres.
    for (const v of variants) {
      for (const g of new Set([g0, allGiven])) {
        forms.add(`${g} ${v}`, "name", false);
        forms.add(`${v} ${g}`, "name", false);
      }
    }
  }

  for (const id of derivedPersonIdentifiers(given, variants)) forms.add(id, "id", false);
}

// ---------------------------------------------------------------------------
// Passe de recherche
// ---------------------------------------------------------------------------

/** Intervalles disjoints triés, union des intervalles donnés. */
function unionIntervals(items: ReadonlyArray<readonly [number, number]>): Array<[number, number]> {
  const sorted = [...items].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const out: Array<[number, number]> = [];
  for (const [s, e] of sorted) {
    const last = out[out.length - 1];
    if (last && s <= last[1]) last[1] = Math.max(last[1], e);
    else out.push([s, e]);
  }
  return out;
}

/** Prépare les dictionnaires une fois ; aucune donnée du texte n'est conservée. */
export function createPersonNamePropagator(ambiguous: ReturnType<typeof collectAmbiguousNames>) {
  return (
    text: string,
    detections: readonly Detection[],
    ctx: AnalysisContext,
    options: Pick<PropagateOptions, "minScore" | "knownPersons" | "ambiguousGivenNames">,
  ): Detection[] => {
    const extra = options.ambiguousGivenNames;
    const given = extra?.size
      ? new Set([...ambiguous.given, ...[...extra].map(foldString)])
      : ambiguous.given;
    return propagateWithAmbiguity(text, detections, ctx, options, {
      given,
      family: ambiguous.family,
    });
  };
}

/**
 * Cherche dans `text` les formes dérivées des noms sûrs de `detections` (et de
 * `options.knownPersons`) ; renvoie les nouvelles détections PERSON, sans modifier l'entrée.
 */
export function propagatePersonNames(
  text: string,
  detections: readonly Detection[],
  ctx: AnalysisContext,
  options: PropagateOptions,
): Detection[] {
  // Sans personne à propager, inutile de replier les dictionnaires de noms ambigus.
  if (!options.knownPersons?.length && !detections.some((d) => d.entityType === "PERSON"))
    return [];

  return propagateWithAmbiguity(text, detections, ctx, options, {
    given: new Set([...(options.ambiguousGivenNames ?? [])].map(foldString)),
    family: new Set([...(options.ambiguousFamilyNames ?? [])].map(foldString)),
  });
}

function propagateWithAmbiguity(
  text: string,
  detections: readonly Detection[],
  ctx: AnalysisContext,
  options: Pick<PropagateOptions, "minScore" | "knownPersons">,
  amb: Ambiguity,
): Detection[] {
  if (!options.knownPersons?.length && !detections.some((d) => d.entityType === "PERSON"))
    return [];
  const { minScore } = options;

  // 1. Noms sûrs → formes.
  const forms = new FormSet();
  const seen = new Set<string>();
  const consider = (raw: string, titled: boolean): void => {
    const key = `${titled ? "t" : "p"}|${normalizeForm(raw, "PERSON")}`;
    if (seen.has(key)) return;
    seen.add(key);
    const parsed = parseName(raw, titled);
    if (parsed) addName(forms, parsed, amb);
  };

  const blockers: Array<readonly [number, number]> = [];
  for (const d of detections) {
    const manual = d.source === "manual";
    if (manual || d.score >= minScore) blockers.push([d.start, d.end]);
    if (d.entityType !== "PERSON" || (!manual && d.score < minScore)) continue;
    const raw = text.slice(d.start, d.end);
    if (raw.length === 0 || raw.length > 80 || /[\r\n]/u.test(raw)) continue;
    const words = normalizeForm(raw, "PERSON").split(" ").filter(Boolean).length;
    // Titre + nom : motif `titres-nom` du pack, ou titre juste avant une détection hors dictionnaire
    // (un prénom du dictionnaire après un titre, « Mme Rose Girard », n'est pas un nom de famille).
    const titled =
      words < 2 &&
      (d.recognizerId.includes("/titres-nom") ||
        (d.source !== "dictionary" && precededByTitle(text, d.start)));
    const ner = d.source === "ner" && d.score >= SAFE_NER_SCORE;
    if (words >= 2 || titled || ner || manual) consider(raw, titled);
  }
  for (const known of options.knownPersons ?? []) {
    if (known.length > 0 && known.length <= 80) consider(known, startsWithTitle(known));
  }
  if (forms.forms.size === 0) return [];

  // 2. Index par premier caractère, formes les plus longues d'abord.
  const index = new Map<string, Form[]>();
  for (const f of forms.forms.values()) {
    const first = f.text[0] as string;
    const bucket = index.get(first);
    if (bucket) bucket.push(f);
    else index.set(first, [f]);
  }
  for (const bucket of index.values()) bucket.sort((a, b) => b.text.length - a.text.length);

  // 3. Une seule passe.
  const { norm, start, end } = normalizeWithMap(text);
  const n = norm.length;
  const covered = unionIntervals(blockers);
  let bi = 0;
  const overlapsCovered = (s: number, e: number): boolean => {
    while (bi < covered.length && (covered[bi] as [number, number])[1] <= s) bi++;
    const c = covered[bi];
    return c !== undefined && c[0] < e;
  };
  const leftOk = (i: number): boolean => {
    if (i === 0) return true;
    const p = norm[i - 1] as string;
    if (isWordChar(p)) return false;
    return !(isJoiner(p) && i >= 2 && isWordChar(norm[i - 2] as string));
  };
  const rightOk = (j: number): boolean => {
    if (j >= n) return true;
    const c = norm[j] as string;
    if (isWordChar(c)) return false;
    return !(isJoiner(c) && j + 1 < n && isWordChar(norm[j + 1] as string));
  };

  const out: Detection[] = [];
  for (let i = 0; i < n;) {
    const bucket = index.get(norm[i] as string);
    if (bucket && leftOk(i)) {
      let matched = false;
      for (const f of bucket) {
        const j = i + f.text.length;
        if (j > n || !norm.startsWith(f.text, i) || !rightOk(j)) continue;
        const s = start[i] as number;
        if (f.capital) {
          const o = text[s] as string;
          if (o === o.toLowerCase()) continue;
        }
        if (f.midSentence && followsSentenceEnd(text, s)) continue;
        const e = end[j - 1] as number;
        if (overlapsCovered(s, e)) continue;
        out.push({
          id: ctx.nextId(),
          start: s,
          end: e,
          entityType: "PERSON",
          score: f.score,
          recognizerId: PROPAGATION_RECOGNIZER_ID,
          packId: PROPAGATION_PACK_ID,
          source: "dictionary",
          explanation: [f.kind === "id" ? EXPLAIN_ID : EXPLAIN_NAME],
        });
        i = j;
        matched = true;
        break;
      }
      if (matched) continue;
    }
    i++;
  }
  return out;
}
