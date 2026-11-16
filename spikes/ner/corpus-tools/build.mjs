// Génère corpus/ner-fr.jsonl et corpus/ner-en.jsonl à partir des sources balisées.
// Les positions sont calculées par l'analyse du balisage (jamais à la main) :
// indices UTF-16 (indices de chaîne JavaScript) sur le texte final, fin exclue.
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "..", "..", "..", "corpus");

const TYPES = { P: "PERSON", O: "ORGANIZATION", L: "LOCATION" };

/** Analyse un texte balisé {P:...}. Retourne { text, entities }. Fonction pure. */
export function parseMarkup(markup) {
  const re = /\{([POL]):([^{}]*)\}/g;
  let text = "";
  let last = 0;
  const entities = [];
  for (const m of markup.matchAll(re)) {
    text += markup.slice(last, m.index);
    const start = text.length;
    text += m[2];
    entities.push({ start, end: text.length, type: TYPES[m[1]] });
    last = m.index + m[0].length;
  }
  text += markup.slice(last);
  if (/[{}]/.test(text)) throw new Error(`Balisage invalide : ${markup}`);
  return { text, entities };
}

export function buildLines(lang, entries) {
  return entries.map(([tag, markup], i) => {
    const { text, entities } = parseMarkup(markup);
    const id = `${lang}-${String(i + 1).padStart(3, "0")}-${tag}`;
    return JSON.stringify({ id, text, entities });
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const lang of ["fr", "en"]) {
    const { default: entries } = await import(`./sources/${lang}.mjs`);
    const lines = buildLines(lang, entries);
    writeFileSync(join(outDir, `ner-${lang}.jsonl`), lines.join("\n") + "\n");
    console.log(`corpus/ner-${lang}.jsonl : ${lines.length} phrases`);
  }
}
