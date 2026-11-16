// S2 — Pseudonymisation de référence pour le spike : à partir d'une table d'entités
// (types, valeur, formes de surface), remplace chaque forme par le jeton du format choisi.
// Fonction pure ; les jetons sont numérotés par type, dans l'ordre de première apparition.

import { getFormat } from "./formats.mjs";

// Les titres de civilité restent en clair devant le jeton (« M. PERSONNE_003 ») : ils ne font pas
// partie du nom, et donnent au LLM l'information de genre qu'il utilise pour accorder et traduire.
const TITLE_RE = /^(?:M\.|Mme|Madame|Monsieur|Dr|Me|Pr)\s+/;

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * @param {string} text Texte source.
 * @param {Array<{ type:string, value:string, surfaces:string[] }>} entities
 * @param {"A"|"B"|"C"} formatId
 * @returns {{ text:string, table:Record<string,string>, occurrences:Array<{token:string,start:number,end:number}> }}
 *   `occurrences` : positions dans le texte pseudonymisé (UTF-16).
 */
export function pseudonymize(text, entities, formatId) {
  const format = getFormat(formatId);

  const owner = new Map(); // forme de surface -> index d'entité
  entities.forEach((e, i) => {
    for (const s of e.surfaces) {
      if (owner.has(s)) throw new Error(`Forme de surface en double : « ${s} »`);
      owner.set(s, i);
    }
  });

  const surfaces = [...owner.keys()].sort((a, b) => b.length - a.length);
  const re = new RegExp(
    `(?<![\\p{L}\\p{N}])(?:${surfaces.map(escapeRe).join("|")})(?![\\p{L}\\p{N}])`,
    "gu",
  );

  // Première passe : numérotation par ordre de première apparition.
  const numbers = new Array(entities.length).fill(0);
  const counters = {};
  for (const m of text.matchAll(re)) {
    const i = owner.get(m[0]);
    if (numbers[i] === 0) {
      const type = entities[i].type;
      counters[type] = (counters[type] ?? 0) + 1;
      numbers[i] = counters[type];
    }
  }
  entities.forEach((e, i) => {
    if (numbers[i] === 0) throw new Error(`Entité absente du texte : ${e.type} « ${e.value} »`);
  });

  // Deuxième passe : remplacement.
  const table = {};
  entities.forEach((e, i) => {
    table[format.render(e.type, numbers[i])] = e.value;
  });

  let out = "";
  let cursor = 0;
  const occurrences = [];
  for (const m of text.matchAll(re)) {
    const i = owner.get(m[0]);
    const token = format.render(entities[i].type, numbers[i]);
    out += text.slice(cursor, m.index);
    const title = TITLE_RE.exec(m[0])?.[0] ?? "";
    out += title;
    occurrences.push({ token, start: out.length, end: out.length + token.length });
    out += token;
    cursor = m.index + m[0].length;
  }
  out += text.slice(cursor);

  return { text: out, table, occurrences };
}
