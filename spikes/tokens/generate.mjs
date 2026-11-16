// S2 — Génère textes/<id>.<format>.txt (5 textes x 3 formats = 15 fichiers).
// Usage : node spikes/tokens/generate.mjs

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { TEXTES_DIR, loadCorpus } from "./corpus.mjs";
import { FORMAT_IDS } from "./formats.mjs";
import { pseudonymize } from "./pseudonymize.mjs";

let n = 0;
for (const t of loadCorpus()) {
  for (const f of FORMAT_IDS) {
    const { text, table } = pseudonymize(t.source, t.entities, f);
    writeFileSync(join(TEXTES_DIR, `${t.id}.${f}.txt`), text, "utf8");
    n++;
    console.log(`${t.id}.${f}.txt  (${Object.keys(table).length} jetons distincts)`);
  }
}
console.log(`${n} fichiers écrits dans ${TEXTES_DIR}`);
