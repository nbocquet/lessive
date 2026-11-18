// Vérifie la cohérence des corpus NER. Code de sortie 1 au moindre défaut.
// Usage : node verify.mjs [fichier.jsonl ...]   (défaut : corpus/ner-fr.jsonl et ner-en.jsonl)
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const VALID_TYPES = new Set(["PERSON", "ORGANIZATION", "LOCATION"]);
const EXPECTED_COUNT = 150;
const MIN_EMOJI = 5;
const MIN_NO_ENTITY = 5;
const EMOJI_RE = /\p{Extended_Pictographic}/u;

/** Retourne la liste des erreurs d'un corpus (tableau de chaînes) et des statistiques. */
export function verifyCorpus(raw, { expectedCount = EXPECTED_COUNT } = {}) {
  const errors = [];
  const stats = { sentences: 0, entities: 0, byType: {}, emoji: 0, noEntity: 0 };
  const ids = new Set();
  const lines = raw.split("\n");
  if (lines.at(-1) === "") lines.pop();
  lines.forEach((line, idx) => {
    const where = `ligne ${idx + 1}`;
    let obj;
    try {
      obj = JSON.parse(line);
    } catch {
      errors.push(`${where} : JSON invalide`);
      return;
    }
    stats.sentences++;
    const keys = Object.keys(obj).sort().join(",");
    if (keys !== "entities,id,text") errors.push(`${where} : clés inattendues (${keys})`);
    if (typeof obj.id !== "string" || obj.id === "") errors.push(`${where} : id manquant`);
    else if (ids.has(obj.id)) errors.push(`${where} : id en double (${obj.id})`);
    else ids.add(obj.id);
    if (typeof obj.text !== "string" || obj.text.trim() === "") {
      errors.push(`${where} : texte vide`);
      return;
    }
    if (!Array.isArray(obj.entities)) {
      errors.push(`${where} : entities n'est pas un tableau`);
      return;
    }
    if (EMOJI_RE.test(obj.text)) stats.emoji++;
    if (obj.entities.length === 0) stats.noEntity++;
    let prevEnd = -1;
    for (const [k, e] of obj.entities.entries()) {
      const w = `${where} (${obj.id}) entité ${k}`;
      if (!Number.isInteger(e.start) || !Number.isInteger(e.end)) {
        errors.push(`${w} : start/end non entiers`);
        continue;
      }
      if (e.start < 0 || e.end > obj.text.length || e.start >= e.end) {
        errors.push(`${w} : intervalle invalide [${e.start}, ${e.end}[`);
        continue;
      }
      if (!VALID_TYPES.has(e.type)) errors.push(`${w} : type invalide (${e.type})`);
      const surface = obj.text.slice(e.start, e.end);
      if (surface.trim() === "") errors.push(`${w} : texte vide`);
      if (surface !== surface.trim()) errors.push(`${w} : espaces en bordure`);
      if (e.start < prevEnd) errors.push(`${w} : chevauchement ou désordre`);
      // Interdit de couper une paire de substitution UTF-16.
      const cut = (i) => {
        const a = obj.text.charCodeAt(i - 1);
        const b = obj.text.charCodeAt(i);
        return a >= 0xd800 && a <= 0xdbff && b >= 0xdc00 && b <= 0xdfff;
      };
      if (cut(e.start) || cut(e.end)) errors.push(`${w} : coupe une paire de substitution`);
      prevEnd = Math.max(prevEnd, e.end);
      stats.entities++;
      stats.byType[e.type] = (stats.byType[e.type] ?? 0) + 1;
    }
  });
  if (stats.sentences !== expectedCount) {
    errors.push(`${stats.sentences} phrases au lieu de ${expectedCount}`);
  }
  if (stats.emoji < MIN_EMOJI) errors.push(`${stats.emoji} phrases avec emoji (min ${MIN_EMOJI})`);
  if (stats.noEntity < MIN_NO_ENTITY) {
    errors.push(`${stats.noEntity} phrases sans entité (min ${MIN_NO_ENTITY})`);
  }
  return { errors, stats };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const files = process.argv.slice(2);
  if (files.length === 0) {
    for (const l of ["fr", "en"]) files.push(join(here, "..", "..", "..", "corpus", `ner-${l}.jsonl`));
  }
  let failed = false;
  for (const f of files) {
    const { errors, stats } = verifyCorpus(readFileSync(f, "utf8"));
    const s = JSON.stringify(stats.byType);
    console.log(
      `${f}\n  ${stats.sentences} phrases, ${stats.entities} entités ${s}, ` +
        `${stats.emoji} avec emoji, ${stats.noEntity} sans entité`,
    );
    if (errors.length) {
      failed = true;
      for (const e of errors) console.log(`  ERREUR ${e}`);
    } else console.log("  OK");
  }
  process.exit(failed ? 1 : 0);
}
