/**
 * Logique pure du NER : étiquettes, regroupement des jetons, reconstruction des positions,
 * segmentation des textes longs, dédoublonnage. Aucune dépendance à Transformers.js : tout se
 * teste avec des sorties de pipeline factices.
 *
 * Portage TypeScript des fonctions éprouvées du spike S1 (`tools/ner-eval/lib.mjs`).
 *
 * Positions (R7) : indices UTF-16 sur le texte original non modifié, fin exclue. La normalisation
 * de recherche se fait sur une copie, avec une table de correspondance des positions.
 */
import type { AnalysisContext, Detection, EntityType } from "../core/types/index.ts";
import { AbortError } from "../core/recognizers/index.ts";

/** Types d'entités que le NER sait produire. */
export type NerEntityType = Extract<EntityType, "PERSON" | "ORGANIZATION" | "LOCATION">;

// ---------------------------------------------------------------------------
// 1. Étiquettes
// ---------------------------------------------------------------------------

const LABEL_MAP: ReadonlyMap<string, NerEntityType> = new Map([
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

/** Retire un préfixe BIOES (`B-`, `I-`, `E-`, `S-`) d'une étiquette de modèle. */
export function stripPrefix(label: string): string {
  return /^[BIES]-/.test(label) ? label.slice(2) : label;
}

/** Étiquette du modèle vers un type Lessive ; `null` pour MISC, DATE, O ou tout type inconnu. */
export function mapLabel(label: unknown): NerEntityType | null {
  if (typeof label !== "string") return null;
  return LABEL_MAP.get(stripPrefix(label).toUpperCase()) ?? null;
}

// ---------------------------------------------------------------------------
// 2. Regroupement des jetons bruts
// ---------------------------------------------------------------------------

/** Jeton brut du pipeline `token-classification` sans agrégation. */
export interface RawToken {
  /** Étiquette du modèle (`B-PER`, `I-ORG`, `PER`…). */
  entity: string;
  /** Jeton décodé (`##pont` pour une continuation WordPiece). */
  word: string;
  score: number;
  /** Position du jeton dans la séquence ; les jetons écartés (`O`) laissent un trou. */
  index: number;
}

/** Groupe de jetons contigus formant une entité candidate. */
export interface TokenGroup {
  /** Étiquette sans préfixe (`PER`, `LOC`, `MISC`…). */
  label: string;
  /** Texte décodé, éventuellement en minuscules, sans accents ou avec des espaces en trop. */
  word: string;
  /** Moyenne des scores des jetons. */
  score: number;
  /**
   * Mots du groupe (continuations WordPiece rattachées au mot précédent). Sert à recouper un groupe
   * aux sauts de ligne du texte original ; absent, le groupe est traité d'un bloc.
   */
  parts?: readonly string[];
}

/**
 * Regroupe des jetons bruts par contiguïté d'`index`. On n'utilise pas l'agrégation de
 * Transformers.js : avec un étiquetage IO (`I-PER` sans `B-`), elle fusionne deux entités séparées
 * par d'autres mots.
 *
 * - un jeton `B-`/`S-`, ou d'un autre type, ouvre un nouveau groupe ;
 * - un jeton non contigu (`index` ≠ précédent + 1) ouvre un nouveau groupe ;
 * - une continuation WordPiece (`##x`) se rattache toujours au groupe contigu précédent ;
 * - SentencePiece ne marque pas les continuations : les jetons contigus de même type sont fusionnés.
 *   Les espaces sont ignorés ensuite par la recherche normalisée, donc « Du pont » retrouve « Dupont ».
 */
export function groupRawTokens(tokens: readonly RawToken[]): TokenGroup[] {
  interface Acc {
    label: string;
    word: string;
    parts: string[];
    scores: number[];
  }
  const groups: Acc[] = [];
  let prevIndex: number | null = null;
  let current: Acc | null = null;
  for (const t of tokens) {
    const label = stripPrefix(t.entity);
    const startsEntity = /^[BS]-/.test(t.entity);
    const contiguous = prevIndex !== null && t.index === prevIndex + 1;
    const wordPiece = t.word.startsWith("##");
    // « ▁ » : marqueur de début de mot de SentencePiece, parfois conservé par le décodeur.
    const piece = (wordPiece ? t.word.slice(2) : t.word).replace(/^▁/, "");
    if (
      current !== null &&
      contiguous &&
      (wordPiece || (!startsEntity && current.label === label))
    ) {
      current.word += wordPiece ? piece : ` ${piece}`;
      if (wordPiece) current.parts[current.parts.length - 1] += piece;
      else current.parts.push(piece);
      current.scores.push(t.score);
    } else {
      current = { label, word: piece, parts: [piece], scores: [t.score] };
      groups.push(current);
    }
    prevIndex = t.index;
  }
  return groups.map((g) => ({
    label: g.label,
    word: g.word,
    parts: g.parts,
    score: g.scores.reduce((a, b) => a + b, 0) / g.scores.length,
  }));
}

// ---------------------------------------------------------------------------
// 3. Normalisation de recherche avec table de positions
// ---------------------------------------------------------------------------

const PUNCT_FOLD: Readonly<Record<string, string>> = {
  "’": "'",
  "‘": "'",
  ʼ: "'",
  "`": "'",
  "–": "-",
  "—": "-",
  "‑": "-",
  "‐": "-",
};

interface FoldedSearchText {
  /** Texte sans espaces, sans diacritiques, en minuscules, apostrophes et tirets unifiés. */
  norm: string;
  /** Pour chaque unité de `norm`, début de l'unité d'origine. */
  startMap: number[];
  /** Pour chaque unité de `norm`, fin (exclue) de l'unité d'origine. */
  endMap: number[];
}

/** Normalise pour la comparaison et mémorise, par unité, l'intervalle d'origine (R7). */
export function foldForSearch(text: string): FoldedSearchText {
  let norm = "";
  const startMap: number[] = [];
  const endMap: number[] = [];
  let idx = 0;
  // `for...of` itère par point de code ; `idx` avance en unités UTF-16.
  for (const ch of text) {
    const len = ch.length;
    if (!/\s/u.test(ch)) {
      const folded = (PUNCT_FOLD[ch] ?? ch).normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
      for (let k = 0; k < folded.length; k++) {
        norm += folded.charAt(k);
        startMap.push(idx);
        endMap.push(idx + len);
      }
    }
    idx += len;
  }
  return { norm, startMap, endMap };
}

// Lettres, chiffres et marques combinantes Unicode : pas de `\b` ASCII (accents, chiffres non latins).
const WORD_CHAR = /[\p{L}\p{N}\p{M}]/u;
const isWordChar = (c: string | undefined): boolean => c !== undefined && WORD_CHAR.test(c);

/** Premier indice `i` de `sorted` (croissant) tel que `sorted[i] >= value`, ou `sorted.length`. */
function lowerBound(sorted: readonly number[], value: number): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if ((sorted[mid] as number) < value) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

// ---------------------------------------------------------------------------
// 4. Reconstruction des positions
// ---------------------------------------------------------------------------

/** Entité localisée dans un texte. */
export interface NerSpan {
  start: number;
  end: number;
  entityType: NerEntityType;
  score: number;
  /**
   * Réservé aux positions non alignées sur des frontières de mots. `locateGroups` n'en produit
   * plus : une occurrence à l'intérieur d'un mot est écartée (voir ci-dessous).
   */
  approximate: boolean;
}

export interface LocateResult {
  spans: NerSpan[];
  /** Groupes d'un type retenu dont le texte n'a pas été retrouvé. */
  unlocated: number;
}

const LINE_BREAK = /[\n\r\u0085\u2028\u2029]/u;

/**
 * Intervalles `[début, fin)` d'un groupe trouvé à l'indice `found` de la copie normalisée, coupés
 * à chaque saut de ligne du texte original situé entre deux de ses mots.
 */
function splitAtLineBreaks(
  text: string,
  { startMap, endMap }: FoldedSearchText,
  found: number,
  g: TokenGroup,
): [number, number][] {
  const first = startMap[found] as number;
  const last = endMap[found + foldForSearch(g.word).norm.length - 1] as number;
  const whole: [number, number][] = [[first, last]];
  if (g.parts === undefined || g.parts.length < 2 || !LINE_BREAK.test(text.slice(first, last))) {
    return whole;
  }
  const runs: [number, number][] = [];
  let offset = found;
  let runStart = -1;
  let prevEnd = -1;
  for (const part of g.parts) {
    const n = foldForSearch(part).norm.length;
    if (n === 0) continue;
    const s = startMap[offset] as number;
    const e = endMap[offset + n - 1] as number;
    offset += n;
    if (runStart !== -1 && LINE_BREAK.test(text.slice(prevEnd, s))) {
      runs.push([runStart, prevEnd]);
      runStart = -1;
    }
    if (runStart === -1) runStart = s;
    prevEnd = e;
  }
  if (runStart !== -1) runs.push([runStart, prevEnd]);
  return runs;
}

/**
 * Retrouve les positions des groupes dans `text`. Transformers.js ne fournit ni `start` ni `end` :
 * le mot décodé (casse, accents et espaces possiblement altérés) est cherché à partir de la fin du
 * dernier groupe trouvé, sur une copie normalisée, puis ramené aux indices de l'original. On
 * ne retient qu'une occurrence alignée sur des frontières de mots (lettres, chiffres Unicode) : un
 * fragment trouvé à l'intérieur d'un mot (« b » dans « Objet », « BERT » dans « JPLAMBERT ») est
 * écarté et compté dans `unlocated`, plutôt que de couper le mot. Un groupe qui couvre un saut de
 * ligne du texte original est recoupé à ce saut : deux personnes de part et d'autre d'un paragraphe
 * ne forment pas une seule entité.
 *
 * Tous les groupes, même ceux d'un type ignoré (MISC…), sont localisés pour faire avancer le curseur :
 * sans cela, un « Marc » ignoré ferait attribuer au « Marc » suivant la position du premier.
 */
export function locateGroups(text: string, groups: readonly TokenGroup[]): LocateResult {
  const spans: NerSpan[] = [];
  let unlocated = 0;
  let cursor = 0;
  let folded: FoldedSearchText | null = null;

  for (const g of groups) {
    const entityType = mapLabel(g.label);
    folded ??= foldForSearch(text);
    const { norm, startMap, endMap } = folded;
    const needle = foldForSearch(g.word).norm;
    if (needle === "") {
      if (entityType !== null) unlocated++;
      continue;
    }
    const from = lowerBound(startMap, cursor);
    let found = -1;
    for (let i = norm.indexOf(needle, from); i !== -1; i = norm.indexOf(needle, i + 1)) {
      const s = startMap[i] as number;
      const e = endMap[i + needle.length - 1] as number;
      if (!isWordChar(text[s - 1]) && !isWordChar(text[e])) {
        found = i;
        break;
      }
    }
    if (found === -1) {
      if (entityType !== null) unlocated++;
      continue;
    }
    cursor = endMap[found + needle.length - 1] as number;
    if (entityType !== null) {
      for (const [start, end] of splitAtLineBreaks(text, folded, found, g)) {
        spans.push({ start, end, entityType, score: g.score, approximate: false });
      }
    }
  }
  return { spans, unlocated };
}

// ---------------------------------------------------------------------------
// 5. Segmentation des textes longs
// ---------------------------------------------------------------------------

export interface Segment {
  /** Position du segment dans le texte complet. */
  offset: number;
  text: string;
}

export const DEFAULT_SEGMENT_CHARS = 1000;
export const DEFAULT_SEGMENT_OVERLAP = 100;

const isSpace = (c: string | undefined): boolean => c !== undefined && /\s/u.test(c);
const isHighSurrogate = (code: number): boolean => code >= 0xd800 && code <= 0xdbff;
const isLowSurrogate = (code: number): boolean => code >= 0xdc00 && code <= 0xdfff;

/** Fin de segment : de préférence après une fin de phrase, sinon après un espace. */
function findSegmentEnd(text: string, start: number, hardEnd: number, minEnd: number): number {
  let firstSpaceCut = -1;
  for (let j = hardEnd; j >= minEnd; j--) {
    if (!isSpace(text[j - 1])) continue;
    if (firstSpaceCut === -1) firstSpaceCut = j;
    if (text[j - 1] === "\n") return j;
    let k = j - 1;
    while (k > start && isSpace(text[k - 1])) k--;
    if (/[.!?…]/.test(text[k - 1] ?? "")) return j;
  }
  if (firstSpaceCut !== -1) return firstSpaceCut;
  // Aucune coupure propre : coupe franche, sans séparer une paire de substitution.
  return isHighSurrogate(text.charCodeAt(hardEnd - 1)) ? hardEnd - 1 : hardEnd;
}

/** Début du segment suivant : premier début de mot à partir de `target`, avant `end`. */
function findNextStart(text: string, target: number, end: number): number {
  for (let j = target; j < end; j++) {
    if (j === 0 || (isSpace(text[j - 1]) && !isSpace(text[j]))) return j;
  }
  return isLowSurrogate(text.charCodeAt(target)) ? target + 1 : target;
}

/**
 * Découpe `text` en segments d'au plus `maxChars` unités UTF-16, sur des frontières de phrases
 * quand c'est possible, avec un recouvrement d'environ `overlap` unités pour qu'une entité à
 * cheval sur une frontière soit entière dans l'un des segments. Un texte assez court donne un
 * seul segment, identique au texte.
 */
export function segmentText(
  text: string,
  maxChars: number = DEFAULT_SEGMENT_CHARS,
  overlap: number = DEFAULT_SEGMENT_OVERLAP,
): Segment[] {
  if (!Number.isInteger(maxChars) || maxChars < 20) {
    throw new RangeError("La taille de segment doit être un entier d'au moins 20.");
  }
  const lap = Math.max(0, Math.min(Math.floor(overlap), Math.floor(maxChars / 3)));
  if (text.length <= maxChars) return text.length === 0 ? [] : [{ offset: 0, text }];

  const segments: Segment[] = [];
  let start = 0;
  for (;;) {
    const hardEnd = Math.min(start + maxChars, text.length);
    const end =
      hardEnd === text.length
        ? hardEnd
        : findSegmentEnd(text, start, hardEnd, start + Math.floor(maxChars / 2));
    segments.push({ offset: start, text: text.slice(start, end) });
    if (end >= text.length) break;
    // lap <= maxChars / 3 et end >= start + maxChars / 2 : le début avance toujours.
    start = findNextStart(text, end - lap, end);
  }
  return segments;
}

// ---------------------------------------------------------------------------
// 6. Dédoublonnage
// ---------------------------------------------------------------------------

/**
 * Supprime les chevauchements entre entités venant de segments voisins : à chevauchement, on garde
 * la plus longue, puis celle de meilleur score, puis la plus à gauche. Résultat trié par `start`.
 */
export function dedupeSpans<T extends { start: number; end: number; score: number }>(
  spans: readonly T[],
): T[] {
  const byPriority = [...spans].sort(
    (a, b) => b.end - b.start - (a.end - a.start) || b.score - a.score || a.start - b.start,
  );
  // Retenus : intervalles disjoints, donc triés à la fois par début et par fin.
  const kept: T[] = [];
  const ends: number[] = [];
  for (const s of byPriority) {
    const i = lowerBound(ends, s.start + 1);
    const next = kept[i];
    if (next !== undefined && next.start < s.end) continue;
    kept.splice(i, 0, s);
    ends.splice(i, 0, s.end);
  }
  return kept;
}

// ---------------------------------------------------------------------------
// 7. Analyse d'un texte complet
// ---------------------------------------------------------------------------

/** Classifieur : sortie brute du pipeline pour un segment (async). */
export type Classifier = (text: string) => Promise<readonly RawToken[]>;

export interface SegmentedOptions {
  maxChars?: number;
  overlap?: number;
  /** Score moyen minimal d'une entité (défaut 0). */
  minScore?: number;
  signal?: AbortSignal;
}

/** Rend la main à la boucle d'événements : les messages (annulation) peuvent être traités. */
export function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Segmente, classe chaque segment, localise les entités, recale les positions sur le texte complet
 * et dédoublonne le recouvrement. Vérifie `signal` entre les segments (levée d'`AbortError`).
 */
export async function recognizeSegments(
  text: string,
  classify: Classifier,
  options: SegmentedOptions = {},
): Promise<NerSpan[]> {
  const { signal, minScore = 0 } = options;
  const all: NerSpan[] = [];
  for (const segment of segmentText(text, options.maxChars, options.overlap)) {
    if (signal?.aborted) throw new AbortError();
    if (segment.text.trim() === "") continue;
    const tokens = await classify(segment.text);
    const { spans } = locateGroups(segment.text, groupRawTokens(tokens));
    for (const s of spans) {
      if (s.score < minScore) continue;
      all.push({ ...s, start: s.start + segment.offset, end: s.end + segment.offset });
    }
    await yieldToEventLoop();
  }
  if (signal?.aborted) throw new AbortError();
  return dedupeSpans(all);
}

// ---------------------------------------------------------------------------
// 8. Detections
// ---------------------------------------------------------------------------

/** Score à la française (0,93), pour les explications. */
function formatScore(score: number): string {
  return String(Math.round(score * 100) / 100).replace(".", ",");
}

/** Détections du contrat `src/core`. L'explication ne contient jamais la valeur détectée (R5). */
export function buildDetections(
  spans: readonly NerSpan[],
  modelId: string,
  nextId: AnalysisContext["nextId"],
): Detection[] {
  return spans.map((s) => ({
    id: nextId(),
    start: s.start,
    end: s.end,
    entityType: s.entityType,
    score: s.score,
    recognizerId: `ner/${modelId}`,
    packId: "ner",
    source: "ner",
    explanation: [
      `Modèle NER ${modelId} : ${s.entityType}, score moyen ${formatScore(s.score)}` +
        (s.approximate ? " (position approximative)" : ""),
    ],
  }));
}

// ---------------------------------------------------------------------------
// 9. Progression du chargement
// ---------------------------------------------------------------------------

/** Événement de progression de Transformers.js (sous-ensemble utile). */
export interface LoadProgressEvent {
  status: string;
  file?: string;
  loaded?: number;
  total?: number;
}

/**
 * Agrège la progression par fichier en une valeur 0..1 croissante. Les fichiers apparaissent au fil
 * du chargement : la valeur est bornée par le maximum déjà atteint pour ne jamais reculer.
 */
export function createProgressTracker(): (event: LoadProgressEvent) => number | null {
  const files = new Map<string, { loaded: number; total: number }>();
  let best = 0;
  return (event) => {
    if (event.file === undefined) return null;
    if (event.status === "progress" && event.total !== undefined && event.loaded !== undefined) {
      files.set(event.file, { loaded: event.loaded, total: event.total });
    } else if (event.status === "done") {
      const known = files.get(event.file);
      if (known) files.set(event.file, { loaded: known.total, total: known.total });
    } else {
      return null;
    }
    let loaded = 0;
    let total = 0;
    for (const f of files.values()) {
      loaded += f.loaded;
      total += f.total;
    }
    if (total <= 0) return null;
    // 0,99 au plus : 1 est réservé à la fin effective du chargement.
    best = Math.max(best, Math.min(0.99, loaded / total));
    return best;
  };
}
