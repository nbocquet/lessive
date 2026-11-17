/**
 * Modèle NER fourni avec la version publiée (ADR 0004) : description, vérification, copie dans `dist/`.
 *
 * Le modèle n'est jamais versionné. Le build ne l'inclut que si la variable d'environnement
 * `LESSIVE_BUNDLED_MODEL` désigne son dossier local ; les fichiers sont alors vérifiés contre les sommes
 * SHA-256 de `scripts/bundled-model/camembert-ner.json`, puis copiés dans `dist/models/bundled/` avec la
 * fiche `bundle.json` (lue par `src/web/bundled-model.ts`) et le texte de licence.
 * Sans la variable, le build est identique à avant : aucun modèle livré.
 */
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = fileURLToPath(new URL("./bundled-model/", import.meta.url));
export const DESCRIPTOR_FILE = join(HERE, "camembert-ner.json");
export const LICENSE_SOURCE = join(HERE, "LICENSE-camembert-ner.txt");
export const ENV_VAR = "LESSIVE_BUNDLED_MODEL";

export interface Descriptor {
  name: string;
  license: string;
  attribution: string;
  licenseFile: string;
  baseUrl: string;
  files: { name: string; sha256: string }[];
}

export function readDescriptor(file = DESCRIPTOR_FILE): Descriptor {
  return JSON.parse(readFileSync(file, "utf8")) as Descriptor;
}

export function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

/** Vérifie le dossier du modèle ; lève une erreur lisible au premier fichier absent ou différent. */
export function verifyModelDir(
  dir: string,
  descriptor = readDescriptor(),
): { name: string; size: number }[] {
  return descriptor.files.map(({ name, sha256: expected }) => {
    const path = join(dir, name);
    if (!existsSync(path)) throw new Error(`Modèle fourni : fichier absent ${path}`);
    const actual = sha256(path);
    if (actual !== expected) {
      throw new Error(`Modèle fourni : somme SHA-256 inattendue pour ${name} (${actual})`);
    }
    return { name, size: statSync(path).size };
  });
}

/** Contenu de `bundle.json` (voir `BundledManifest` dans `src/web/bundled-model.ts`). */
export function manifestFor(
  files: { name: string; size: number }[],
  descriptor = readDescriptor(),
) {
  const { name, license, attribution, licenseFile } = descriptor;
  return { name, license, attribution, licenseFile, files };
}

/** Copie le modèle vérifié dans `<outDir>/models/bundled/`. */
export function writeBundle(outDir: string, modelDir: string, descriptor = readDescriptor()): void {
  const files = verifyModelDir(modelDir, descriptor);
  const target = join(outDir, "models", "bundled");
  for (const { name } of files) {
    const dest = join(target, name);
    mkdirSync(dirname(dest), { recursive: true });
    cpSync(join(modelDir, name), dest);
  }
  cpSync(LICENSE_SOURCE, join(target, descriptor.licenseFile));
  writeFileSync(
    join(target, "bundle.json"),
    JSON.stringify(manifestFor(files, descriptor), null, 2),
  );
}
