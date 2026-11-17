/**
 * Modèle NER fourni avec la version publiée (ADR 0004).
 *
 * Quand le build l'inclut (`LESSIVE_BUNDLED_MODEL`, voir `scripts/vite-plugin-local-assets.ts`), le
 * modèle est servi par l'origine de l'application sous `<racine>/models/bundled/`, avec une fiche
 * `bundle.json`. Rien n'est téléchargé sans action de l'utilisateur : il clique sur « Installer le
 * modèle fourni », les fichiers sont lus depuis la même origine (CSP `connect-src 'self'`, R1, R4),
 * validés comme un modèle chargé depuis le disque, puis rangés dans Cache Storage par `storeModel`.
 * Ensuite tout se passe comme pour un modèle chargé par l'utilisateur, hors ligne compris.
 *
 * Seul fichier de `src/web` avec `dev-model.ts` autorisé à employer `fetch` (voir `conventions.test.ts`) :
 * toujours une URL relative à la racine de l'application, jamais une autre origine.
 */
import { validateModel, type PreparedModel, type Result } from "./model-store.ts";
import { checkModelSizes } from "./model-limits.ts";

/** Dossier du modèle fourni, relatif à la racine de l'application. */
export const BUNDLED_DIR = "models/bundled/";
export const BUNDLED_MANIFEST = "bundle.json";

export interface BundledFile {
  /** Nom canonique (`config.json`, `onnx/model_quantized.onnx`…). */
  name: string;
  size: number;
}

/** Contenu de `bundle.json`, écrit au build. */
export interface BundledManifest {
  /** Identifiant du modèle (`Xenova/camembert-ner`). */
  name: string;
  /** Licence du modèle (`MIT`). */
  license: string;
  /** Une phrase d'attribution, en français. */
  attribution: string;
  /** Fichier de licence, relatif à `BUNDLED_DIR`. */
  licenseFile: string;
  files: BundledFile[];
}

const REQUIRED = ["config.json", "tokenizer.json", "tokenizer_config.json"];
const ONNX_Q8 = "onnx/model_quantized.onnx";
const SAFE_NAME = /^(?:onnx\/)?[A-Za-z0-9_.-]+$/;

/** Vérifie la forme de `bundle.json`. Pure. */
export function parseManifest(value: unknown): BundledManifest | undefined {
  if (value === null || typeof value !== "object") return undefined;
  const m = value as Record<string, unknown>;
  const str = (k: string) => (typeof m[k] === "string" && m[k] !== "" ? (m[k] as string) : null);
  const name = str("name");
  const license = str("license");
  const attribution = str("attribution");
  const licenseFile = str("licenseFile");
  if (!name || !license || !attribution || !licenseFile || !SAFE_NAME.test(licenseFile))
    return undefined;
  if (!Array.isArray(m["files"])) return undefined;
  const files: BundledFile[] = [];
  for (const f of m["files"] as unknown[]) {
    if (f === null || typeof f !== "object") return undefined;
    const { name: fname, size } = f as Record<string, unknown>;
    if (typeof fname !== "string" || !SAFE_NAME.test(fname) || fname.includes(".."))
      return undefined;
    if (typeof size !== "number" || !Number.isSafeInteger(size) || size <= 0) return undefined;
    files.push({ name: fname, size });
  }
  const names = new Set(files.map((f) => f.name));
  if (checkModelSizes(files)) return undefined;
  if (![...REQUIRED, ONNX_Q8].every((n) => names.has(n))) return undefined;
  return { name, license, attribution, licenseFile, files };
}

/** Taille totale à télécharger, en octets. */
export function bundledSize(manifest: BundledManifest): number {
  return manifest.files.reduce((sum, f) => sum + f.size, 0);
}

const isHtml = (res: Response) => (res.headers.get("content-type") ?? "").startsWith("text/html");

/** Fiche du modèle fourni, ou `undefined` si cette version n'en contient pas. */
export async function probeBundledModel(
  appRoot: string | URL,
): Promise<BundledManifest | undefined> {
  try {
    const res = await fetch(new URL(`${BUNDLED_DIR}${BUNDLED_MANIFEST}`, appRoot));
    if (!res.ok || isHtml(res)) return undefined;
    // La fiche elle-même est non fiable : borner sa lecture avant JSON.parse.
    const blob = await readAll(res, 64 * 1024);
    return parseManifest(JSON.parse(await blob.text()));
  } catch {
    return undefined;
  }
}

/** Compte les octets réels et annule le flux avant de conserver un bloc qui dépasse le plafond. */
async function readAll(
  res: Response,
  maxBytes: number,
  onBytes: (n: number) => void = () => undefined,
): Promise<Blob> {
  const reader = res.body?.getReader();
  if (!reader) return new Blob([]);
  const chunks: BlobPart[] = [];
  let received = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > maxBytes) throw new Error("Taille de téléchargement dépassée.");
      chunks.push(value);
      onBytes(value.byteLength);
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }
  return new Blob(chunks);
}

/**
 * Télécharge le modèle fourni depuis l'origine de l'application et le valide.
 * `onProgress` reçoit une valeur entre 0 et 1.
 */
export async function fetchBundledModel(
  appRoot: string | URL,
  manifest: BundledManifest,
  onProgress: (progress: number) => void = () => undefined,
): Promise<Result<PreparedModel>> {
  const sizeError = checkModelSizes(manifest.files);
  if (sizeError) return { ok: false, error: sizeError };
  const total = bundledSize(manifest);
  let received = 0;
  const blobs = new Map<string, Blob>();
  for (const file of manifest.files) {
    let res: Response;
    try {
      res = await fetch(new URL(`${BUNDLED_DIR}${file.name}`, appRoot));
    } catch {
      return { ok: false, error: "Le modèle fourni n'a pas pu être téléchargé (connexion ?)." };
    }
    if (!res.ok || isHtml(res)) {
      return { ok: false, error: `Fichier du modèle fourni introuvable : ${file.name}.` };
    }
    let blob: Blob;
    try {
      // Les tailles annoncées sont déjà bornées ; le flux doit aussi les respecter.
      blob = await readAll(res, file.size, (n) => {
        received += n;
        onProgress(Math.min(1, received / total));
      });
    } catch {
      return {
        ok: false,
        error: "Téléchargement du modèle interrompu : taille dépassée ou lecture impossible.",
      };
    }
    if (blob.size !== file.size) {
      return { ok: false, error: `Fichier du modèle fourni incomplet : ${file.name}.` };
    }
    blobs.set(file.name, blob);
  }
  const text = (name: string) => blobs.get(name)?.text() ?? Promise.resolve("");
  const validated = validateModel({
    folderName: "",
    configText: await text("config.json"),
    tokenizerText: await text("tokenizer.json"),
    tokenizerConfigText: await text("tokenizer_config.json"),
    dtype: "q8",
    onnxSize: blobs.get(ONNX_Q8)?.size ?? 0,
    totalSize: total,
  });
  if (!validated.ok) return validated;
  // Le nom affiché est celui du dépôt fourni, pas celui du modèle d'origine écrit dans config.json.
  return { ok: true, value: { info: { ...validated.value, name: manifest.name }, blobs } };
}
