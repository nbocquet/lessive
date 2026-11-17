/**
 * Résolution d'entités : décide si une forme de surface (« Mme Martin »)
 * désigne une entité déjà connue de la session ou une nouvelle.
 *
 * Fonctions pures, sans état : la session leur passe ses entités.
 *
 * PERSON
 * ------
 * La forme est normalisée (casse, accents, espaces, ponctuation, titres de
 * civilité) puis analysée en { prénoms, nom } :
 *  - les mots à partir de la première particule (de, du, des, d', la, le, les,
 *    l', van, von, der, den, di, da, del, della, dos, das, el, ter, ten)
 *    forment le nom (« Jean-Pierre de La Tour » : prénom « jean-pierre », nom
 *    « de la tour ») ; sans particule, le dernier mot est le nom ;
 *  - un nom précédé de particules a un « cœur » : « de La Tour », « La Tour »
 *    et « Tour » ont le même cœur « tour ».
 * Règles, dans l'ordre :
 *  1. forme normalisée identique à une forme connue : même entité ;
 *  2. initiale + nom (« C. Martin ») : rattachée à l'unique entité dont un
 *     prénom commence par cette initiale et dont le nom a le même cœur ;
 *     needsReview. Plusieurs candidats : nouvelle entité, needsReview ;
 *  3. un seul mot, ou un nom seul avec particule (« La Tour »), égal au
 *     premier prénom ou au cœur du nom d'exactement une entité : rattachée,
 *     needsReview. Plusieurs entités : nouvelle entité, needsReview ;
 *  4. sinon : nouvelle entité.
 *
 * Limites connues
 *  - Un prénom composé (« Jean-Pierre ») est un seul mot : « Jean » ne s'y
 *    rattache pas.
 *  - Prénoms multiples sans particule (« Jean Pierre Dupont ») : seul le
 *    dernier mot est le nom ; « Jean Dupont » reste une autre entité.
 *  - Noms composés sans particule ni trait d'union (« Dupont Martin ») : le
 *    dernier mot est pris pour le nom.
 *  - « Claire Martin » citée après « Claire » seule : nouvelle entité (le
 *    rattachement ne va que du connu vers le partiel) ; à fusionner à la main.
 *  - Ordre inversé (« Martin Claire »), surnoms, fautes de frappe : non gérés.
 *  - « M. Dupont » et « Mme Dupont » reçoivent le même pseudonyme : les titres
 *    sont retirés à la normalisation et le pack exclut le titre de
 *    l'intervalle détecté, donc la civilité ne distingue pas deux personnes
 *    (deux membres d'une même famille, par exemple). C'est à l'utilisateur de
 *    scinder l'entité (`split`) quand ce sont deux personnes différentes.
 *  - « M. » est toujours un titre, jamais une initiale ; « Me » toujours un
 *    titre s'il est suivi d'un autre mot.
 *
 * ORGANIZATION et LOCATION : correspondance exacte après normalisation
 * (casse, accents, espaces, ponctuation finale), sans titres.
 *
 * Autres types : correspondance exacte après normalisation légère (voir
 * `normalizeForm`).
 */
import type { Entity, EntityType } from "../types/index.ts";

const TITLES: ReadonlySet<string> = new Set([
  "m",
  "mr",
  "mme",
  "mlle",
  "mrs",
  "ms",
  "dr",
  "pr",
  "me",
  "monsieur",
  "madame",
  "mademoiselle",
  "maitre",
  "docteur",
  "professeur",
]);

const PARTICLES: ReadonlySet<string> = new Set([
  "de",
  "du",
  "des",
  "d'",
  "la",
  "le",
  "les",
  "l'",
  "van",
  "von",
  "der",
  "den",
  "di",
  "da",
  "del",
  "della",
  "dos",
  "das",
  "el",
  "ter",
  "ten",
]);

/** Types dont la valeur est un identifiant : espaces, points et tirets sont sans signification. */
const SEPARATED_IDENTIFIERS: ReadonlySet<EntityType> = new Set([
  "PHONE",
  "CH_AVS",
  "CH_UID",
  "FR_NIR",
  "FR_SIREN",
  "FR_SIRET",
  "CREDIT_CARD",
]);

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/\p{M}+/gu, "");
}

/** Mots minuscules, sans accents, sans ponctuation en bordure ; « d'Aubigné » → « d' », « aubigne ». */
function words(form: string): string[] {
  const base = stripAccents(form).toLowerCase().replace(/[’‘`]/gu, "'");
  const out: string[] = [];
  for (const raw of base.split(/\s+/u)) {
    const w = raw.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
    if (!w) continue;
    const elision = /^([dl]')(.+)$/u.exec(w);
    if (elision) out.push(elision[1] as string, elision[2] as string);
    else out.push(w);
  }
  return out;
}

function join(ws: readonly string[]): string {
  let out = "";
  ws.forEach((w, i) => {
    out += i > 0 && !(ws[i - 1] as string).endsWith("'") ? ` ${w}` : w;
  });
  return out;
}

/** Retire les titres de civilité en tête, en gardant au moins un mot. */
function stripTitles(ws: string[]): string[] {
  let i = 0;
  while (i < ws.length - 1 && TITLES.has(ws[i] as string)) i++;
  return ws.slice(i);
}

/**
 * Forme normalisée servant de clé de comparaison exacte.
 *  - PERSON : sans titres ; ORGANIZATION, LOCATION : casse, accents, espaces,
 *    ponctuation en bordure ;
 *  - EMAIL : minuscules ; IBAN : sans espaces, majuscules ;
 *  - téléphone, AVS, IDE, NIR, SIREN, SIRET, carte : sans espaces, points ni tirets,
 *    majuscules ;
 *  - autres types : espaces normalisés, casse conservée (un secret est sensible à la casse).
 */
export function normalizeForm(form: string, entityType: EntityType): string {
  switch (entityType) {
    case "PERSON":
      return join(stripTitles(words(form)));
    case "ORGANIZATION":
    case "LOCATION":
      return join(words(form));
    case "EMAIL":
      return form.trim().toLowerCase();
    case "IBAN":
      return form.replace(/\s+/gu, "").toUpperCase();
    default:
      return SEPARATED_IDENTIFIERS.has(entityType)
        ? form.replace(/[\s.-]+/gu, "").toUpperCase()
        : form.trim().replace(/\s+/gu, " ");
  }
}

interface ParsedName {
  key: string;
  /** `single` : un mot ; `family` : nom seul commençant par une particule ; `full` : prénom(s) + nom. */
  kind: "single" | "family" | "full";
  /** Prénoms (vide sauf pour `full`). */
  given: string[];
  /** Nom sans les particules de tête (« tour » pour « de la tour »). */
  core: string;
}

function parseName(form: string): ParsedName {
  const ws = stripTitles(words(form));
  const key = join(ws);
  const p = ws.findIndex((w) => PARTICLES.has(w));
  const coreOf = (family: string[]): string => {
    let i = 0;
    while (i < family.length - 1 && PARTICLES.has(family[i] as string)) i++;
    return join(family.slice(i));
  };
  if (p === 0) return { key, kind: "family", given: [], core: coreOf(ws) };
  if (p > 0) return { key, kind: "full", given: ws.slice(0, p), core: coreOf(ws.slice(p)) };
  if (ws.length <= 1) return { key, kind: "single", given: [], core: key };
  return { key, kind: "full", given: ws.slice(0, -1), core: ws[ws.length - 1] as string };
}

/** Résultat de la résolution d'une forme. */
export type ResolutionMatch =
  /** Forme déjà connue de cette entité (aucun changement de `needsReview`). */
  | { outcome: "exact"; entity: Entity }
  /** Forme partielle rattachée à une entité : `needsReview` doit passer à vrai. */
  | { outcome: "attached"; entity: Entity }
  /** Aucune entité ne convient : en créer une avec ce `needsReview`. */
  | { outcome: "new"; needsReview: boolean };

/**
 * Cherche l'entité de `entities` (de même type) désignée par `form`.
 * Ne modifie rien.
 */
export function matchSurfaceForm(
  form: string,
  entityType: EntityType,
  entities: readonly Entity[],
): ResolutionMatch {
  const key = normalizeForm(form, entityType);
  const candidates = entities.filter((e) => e.entityType === entityType);

  const exact = candidates.find((e) =>
    e.surfaceForms.some((f) => normalizeForm(f, entityType) === key),
  );
  if (exact) return { outcome: "exact", entity: exact };
  if (entityType !== "PERSON") return { outcome: "new", needsReview: false };

  const query = parseName(form);
  const pick = (matching: Entity[]): ResolutionMatch =>
    matching.length === 1
      ? { outcome: "attached", entity: matching[0] as Entity }
      : { outcome: "new", needsReview: matching.length > 1 };

  // Initiale + nom : « C. Martin ».
  const initial = query.given.length === 1 ? (query.given[0] as string) : "";
  if (query.kind === "full" && [...initial].length === 1) {
    return pick(
      candidates.filter((e) =>
        e.surfaceForms.some((f) => {
          const p = parseName(f);
          return (
            p.kind === "full" && p.core === query.core && (p.given[0] as string).startsWith(initial)
          );
        }),
      ),
    );
  }

  // Un mot, ou un nom seul : « Claire », « Martin », « La Tour ».
  if (query.kind === "single" || query.kind === "family") {
    return pick(
      candidates.filter((e) =>
        e.surfaceForms.some((f) => {
          const p = parseName(f);
          const asFamily = p.core === query.core;
          if (query.kind === "family") return asFamily;
          return asFamily || (p.kind === "full" && p.given[0] === query.key);
        }),
      ),
    );
  }

  return { outcome: "new", needsReview: false };
}
