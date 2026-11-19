import { ENTITY_PRIORITY } from "../types/entities.ts";
import type { Detection } from "../types/detection.ts";

export interface ResolveConflictsOptions {
  /** Score minimal (inclus) pour participer à la résolution. Défaut : 0,5. Sans effet sur `manual`. */
  minScore?: number;
  /**
   * Texte analysé. Optionnel : il permet de rogner à des frontières de mot une détection qui
   * déborde d'une unité protégée (adresse e-mail ou postale entière). Sans lui, elle est écartée.
   */
  text?: string;
}

export interface ConflictResolution {
  /** Détections retenues, triées par `start` croissant, sans chevauchement. */
  kept: Detection[];
  /** Détections écartées (invalides, sous le seuil ou perdantes), triées par start, end, id. */
  discarded: Detection[];
}

const DEFAULT_MIN_SCORE = 0.5;

/** Comparaison de chaînes indépendante de la locale (unités de code UTF-16). */
function cmpStr(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Vrai si `a` contient strictement `b` (intervalle inclus et différent). */
function strictlyContains(a: Detection, b: Detection): boolean {
  return a.start <= b.start && a.end >= b.end && (a.start < b.start || a.end > b.end);
}

function fmt(n: number): string {
  return n.toFixed(2).replace(".", ",");
}

interface Verdict {
  /** < 0 : `a` l'emporte ; > 0 : `b` l'emporte ; 0 : indiscernables. */
  cmp: number;
  /** Raison lisible (sans valeur originale) de la règle qui a tranché. */
  reason: string;
}

/**
 * Applique la politique de la section 5 du plan, dans l'ordre :
 * manuel, validé, inclusion avec score ≥, score, priorité du type,
 * longueur, puis `recognizerId` et `id`.
 */
function decide(a: Detection, b: Detection): Verdict {
  const aManual = a.source === "manual";
  const bManual = b.source === "manual";
  if (aManual !== bManual) {
    return { cmp: aManual ? -1 : 1, reason: "ajout manuel prioritaire" };
  }

  const aValid = a.validated === true;
  const bValid = b.validated === true;
  if (aValid !== bValid) {
    return { cmp: aValid ? -1 : 1, reason: "validée par un validateur algorithmique" };
  }

  if (strictlyContains(a, b) && a.score >= b.score) {
    return { cmp: -1, reason: "intervalle plus large avec un score au moins égal" };
  }
  if (strictlyContains(b, a) && b.score >= a.score) {
    return { cmp: 1, reason: "intervalle plus large avec un score au moins égal" };
  }

  if (a.score !== b.score) {
    return {
      cmp: a.score > b.score ? -1 : 1,
      reason: `score plus élevé (${fmt(Math.max(a.score, b.score))} contre ${fmt(Math.min(a.score, b.score))})`,
    };
  }

  const pa = ENTITY_PRIORITY[a.entityType];
  const pb = ENTITY_PRIORITY[b.entityType];
  if (pa !== pb) {
    return { cmp: pa > pb ? -1 : 1, reason: "type d'entité plus prioritaire" };
  }

  const la = a.end - a.start;
  const lb = b.end - b.start;
  if (la !== lb) {
    return { cmp: la > lb ? -1 : 1, reason: "intervalle plus long" };
  }

  const byRecognizer = cmpStr(a.recognizerId, b.recognizerId);
  if (byRecognizer !== 0) {
    return { cmp: byRecognizer, reason: "ordre alphabétique des détecteurs" };
  }
  return { cmp: cmpStr(a.id, b.id), reason: "ordre des identifiants" };
}

/**
 * Comparateur de la politique de conflits : négatif si `a` passe avant `b`
 * (c'est-à-dire l'emporte). Il ne renvoie 0 que pour deux détections qui ne se
 * distinguent ni par la politique ni par leur identifiant.
 */
export function compareDetections(a: Detection, b: Detection): number {
  return decide(a, b).cmp;
}

/**
 * Ordre canonique, fondé uniquement sur le contenu des détections (clé
 * lexicographique, donc véritablement total et transitif).
 *
 * Pourquoi : la règle 3 (inclusion) est une comparaison par paire qui peut ne
 * pas être transitive (A contient B à score égal, B bat C par priorité de type,
 * C bat A par priorité de type). Un tri avec un tel comparateur dépendrait de
 * l'ordre d'entrée. En triant d'abord de façon canonique, la séquence donnée
 * au tri « politique » est la même pour toute permutation de l'entrée, et le
 * résultat est donc identique (le tri de JS est stable et déterministe).
 */
function compareCanonical(a: Detection, b: Detection): number {
  return (
    a.start - b.start ||
    a.end - b.end ||
    cmpStr(a.entityType, b.entityType) ||
    cmpStr(a.recognizerId, b.recognizerId) ||
    cmpStr(a.id, b.id) ||
    cmpStr(a.packId, b.packId) ||
    cmpStr(a.source, b.source) ||
    a.score - b.score ||
    Number(a.validated === true) - Number(b.validated === true) ||
    cmpStr(a.explanation.join("\n"), b.explanation.join("\n"))
  );
}

function copyOf(d: Detection): Detection {
  return { ...d, explanation: [...d.explanation] };
}

function discard(d: Detection, line: string, supersededBy?: string): Detection {
  const copy = copyOf(d);
  copy.explanation.push(line);
  if (supersededBy !== undefined) copy.supersededBy = supersededBy;
  return copy;
}

/** Identifiant de la détection de rue + code postal + ville produite par la fusion d'adresses. */
const ADDRESS_MERGE_ID = "core/address-merge";

/**
 * Unité protégée : une adresse e-mail entière, ou une adresse postale réunie par les règles
 * (hors ajout manuel, qui suit sa propre priorité).
 */
function isProtectedUnit(d: Detection): boolean {
  return d.source !== "manual" && (d.entityType === "EMAIL" || d.recognizerId === ADDRESS_MERGE_ID);
}

const WORD_CHAR = /[\p{L}\p{N}]/u;
const isWordAt = (text: string, i: number): boolean => {
  const cp = text.codePointAt(i);
  return cp !== undefined && WORD_CHAR.test(String.fromCodePoint(cp));
};
const isLow = (c: number) => c >= 0xdc00 && c <= 0xdfff;
const isHigh = (c: number) => c >= 0xd800 && c <= 0xdbff;

/** Vrai si la coupe en `pos` ne tombe pas au milieu d'un mot (ni d'une paire de substitution). */
function isWordBoundary(text: string, pos: number): boolean {
  if (pos <= 0 || pos >= text.length) return true;
  if (isHigh(text.charCodeAt(pos - 1)) && isLow(text.charCodeAt(pos))) return false;
  return !(isWordAt(text, pos - 1) && isWordAt(text, pos));
}

/** Resserre [start, end) sur ses lettres et chiffres extrêmes ; null s'il n'en reste aucun. */
function tighten(text: string, start: number, end: number): [number, number] | null {
  let s = start;
  let e = end;
  while (s < e && !isWordAt(text, s)) s++;
  while (e > s && !isWordAt(text, isLow(text.charCodeAt(e - 1)) ? e - 2 : e - 1)) e--;
  return s < e ? [s, e] : null;
}

/**
 * Applique les unités protégées avant la résolution : une unité l'emporte sur toute détection
 * non manuelle qu'elle chevauche, quel que soit le score.
 *  - fragment strictement contenu : écarté ;
 *  - détection qui déborde d'un côté : rognée à sa partie extérieure si le texte est fourni, si la
 *    coupe tombe entre deux mots et s'il reste des lettres ou chiffres ; sinon écartée ;
 *  - détection qui contient l'unité : laissée à la politique habituelle ;
 *  - ajouts manuels et chevauchement entre deux unités : laissés à la politique habituelle.
 * Sans la rognure, une détection qui déborde gagnerait seule après l'éviction de ses fragments
 * internes et laisserait le reste de l'unité en clair.
 *
 * C'est un filtre préalable, et non une règle de `decide` : la politique par paire est déjà
 * non transitive (voir `compareCanonical`) et une règle de plus y créerait des cycles avec des
 * détections de score intermédiaire, qui défont le tri. Les unités sont parcourues dans l'ordre
 * canonique : le résultat ne dépend pas de l'ordre d'entrée.
 */
function applyProtectedUnits(
  candidates: Detection[],
  discarded: Detection[],
  text: string | undefined,
): Detection[] {
  const units = candidates.filter(isProtectedUnit).sort(compareCanonical);
  if (units.length === 0) return [...candidates];
  const maxEnd: number[] = [];
  units.forEach((u, i) => maxEnd.push(Math.max(u.end, i > 0 ? maxEnd[i - 1]! : u.end)));

  const out: Detection[] = [];
  for (const d of candidates) {
    if (d.source === "manual" || isProtectedUnit(d)) {
      out.push(d);
      continue;
    }
    // Premier indice dont la fin cumulée dépasse d.start.
    let lo = 0;
    let hi = units.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (maxEnd[mid]! > d.start) hi = mid;
      else lo = mid + 1;
    }
    let cur = d;
    let dropped: Detection | undefined;
    let trimmed = false;
    for (let j = lo; j < units.length && units[j]!.start < d.end; j++) {
      const u = units[j]!;
      if (u.end <= cur.start || u.start >= cur.end) continue;
      if (u.start <= cur.start && u.end >= cur.end) {
        dropped = u; // contenue dans l'unité (ou identique)
        break;
      }
      if (cur.start <= u.start && cur.end >= u.end) continue; // d contient l'unité
      // Chevauchement partiel : on garde la partie extérieure.
      const left = u.start <= cur.start;
      const t =
        text !== undefined && isWordBoundary(text, left ? u.end : u.start)
          ? tighten(text, left ? u.end : cur.start, left ? cur.end : u.start)
          : null;
      if (t === null) {
        dropped = u;
        break;
      }
      cur = { ...cur, explanation: [...cur.explanation], start: t[0], end: t[1] };
      trimmed = true;
    }
    if (dropped !== undefined) {
      discarded.push(
        discard(
          d,
          `écartée au profit d'une détection ${dropped.entityType} : unité protégée (adresse entière) qu'elle chevauche`,
          dropped.id,
        ),
      );
    } else {
      if (trimmed) {
        cur.explanation.push(
          "rognée : sa partie dans une unité protégée (adresse entière) est retirée",
        );
      }
      out.push(cur);
    }
  }
  return out;
}

/**
 * Résout les conflits entre détections (chevauchements).
 *
 * Fonction pure : n'altère pas l'entrée, renvoie des copies. Résultat
 * indépendant de l'ordre d'entrée.
 *
 * 1. Les intervalles vides ou invalides et les détections sous `minScore`
 *    (sauf `manual`) sont écartés d'emblée.
 * 2. Tri canonique puis tri par politique (meilleure détection d'abord).
 * 3. Parcours glouton : on garde une détection si elle ne chevauche aucune
 *    détection déjà gardée. Les gardées ne se chevauchant pas, elles restent
 *    triées par `start` et un chevauchement se trouve par recherche
 *    dichotomique : O(n log n) au total.
 *
 * Un perdant n'exclut personne : dans une chaîne A–B–C où B bat A, A et C ne
 * se chevauchent pas, A et C sont écartées au profit de B ; si en revanche A
 * bat B, C est gardée car B n'est pas retenue.
 */
export function resolveConflicts(
  detections: readonly Detection[],
  options: ResolveConflictsOptions = {},
): ConflictResolution {
  const minScore = options.minScore ?? DEFAULT_MIN_SCORE;
  const discarded: Detection[] = [];
  const candidates: Detection[] = [];

  for (const d of detections) {
    if (!(d.end > d.start)) {
      discarded.push(discard(d, "écartée : intervalle vide ou invalide"));
    } else if (d.source !== "manual" && !(d.score >= minScore)) {
      discarded.push(
        discard(d, `écartée : sous le seuil (score ${fmt(d.score)}, seuil ${fmt(minScore)})`),
      );
    } else {
      candidates.push(d);
    }
  }

  const ordered = applyProtectedUnits(candidates, discarded, options.text)
    .sort(compareCanonical)
    .sort(compareDetections);

  const kept: Detection[] = [];
  // Détecteurs ayant produit le même intervalle et le même type qu'une gardée.
  const confirmations = new Map<string, Set<string>>();

  for (const d of ordered) {
    // Premier indice dont la fin dépasse le début de d : seul candidat au chevauchement
    // le plus à gauche, les gardées étant disjointes et triées.
    let lo = 0;
    let hi = kept.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (kept[mid]!.end > d.start) hi = mid;
      else lo = mid + 1;
    }
    const first = kept[lo];
    if (first === undefined || first.start >= d.end) {
      kept.splice(lo, 0, copyOf(d));
      continue;
    }

    const verdict = decide(first, d);
    // Si la comparaison par paire contredit l'ordre global (cas non transitif),
    // on le dit plutôt que d'afficher une raison fausse.
    const reason = verdict.cmp < 0 ? verdict.reason : "ordre de résolution global";
    discarded.push(
      discard(d, `écartée au profit d'une détection ${first.entityType} : ${reason}`, first.id),
    );

    if (
      first.start === d.start &&
      first.end === d.end &&
      first.entityType === d.entityType &&
      first.recognizerId !== d.recognizerId
    ) {
      let set = confirmations.get(first.id);
      if (set === undefined) confirmations.set(first.id, (set = new Set()));
      set.add(d.recognizerId);
    }
  }

  for (const k of kept) {
    const others = confirmations.get(k.id);
    if (others !== undefined) {
      k.explanation.push(
        `confirmée par un autre détecteur : ${[...others].sort(cmpStr).join(", ")}`,
      );
    }
  }

  discarded.sort((a, b) => a.start - b.start || a.end - b.end || cmpStr(a.id, b.id));
  return { kept, discarded };
}
