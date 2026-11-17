/**
 * Télécharge le modèle fourni (ADR 0004) dans un dossier, puis vérifie ses sommes SHA-256.
 * Sert au workflow de publication (`.github/workflows/pages.yml`) ; jamais à l'exécution de l'application.
 *
 *   node scripts/fetch-bundled-model.ts <dossier>
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { readDescriptor, verifyModelDir } from "./bundled-model.ts";

const dir = process.argv[2];
if (!dir) {
  process.stderr.write("Usage : node scripts/fetch-bundled-model.ts <dossier>\n");
  process.exit(2);
}

const descriptor = readDescriptor();
for (const { name } of descriptor.files) {
  const url = new URL(name, descriptor.baseUrl);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Téléchargement impossible (${res.status}) : ${url.href}`);
  const dest = join(dir, name);
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, new Uint8Array(await res.arrayBuffer()));
  process.stdout.write(`${name} téléchargé\n`);
}
const files = verifyModelDir(dir, descriptor);
process.stdout.write(`Modèle vérifié : ${files.length} fichiers, sommes SHA-256 conformes.\n`);
