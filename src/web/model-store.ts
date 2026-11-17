/**
 * Modèle NER chargé par l'utilisateur : sélection, validation, stockage local (ADR 0003).
 *
 * Le modèle n'est pas livré avec l'application. L'utilisateur choisit un dossier sur son disque ; les
 * fichiers sont validés, puis copiés dans Cache Storage (`lessive-models-v1`) sous des URL synthétiques de
 * même origine (`<racine>/models/local/<fichier>`). Ces URL ne sont jamais requêtées : elles ne servent
 * que de clés. Le cache ne contient QUE les fichiers du modèle et une petite fiche descriptive, jamais
 * de texte de l'utilisateur (R5). Sans Cache Storage (navigation privée), les fichiers restent en mémoire
 * pour la session, sous forme de `Blob` (références vers le disque, pas de copie des octets).
 *
 * Ce module sert la page et le worker d'analyse ; la partie validation est pure (testée sous Node).
 */
import { LocalModelMissingError, type LocalModelFileSource } from "../ner/local-files.ts";
import { mapLabel, stripPrefix } from "../ner/postprocess.ts";

export const MODEL_CACHE_NAME = "lessive-models-v1";
/** Fiche descriptive stockée à côté des fichiers du modèle. */
export const MODEL_META_FILE = "lessive-model.json";
/** Au-delà, avertissement : un modèle aussi lourd sera lent à charger. */
export const MODEL_LARGE_WARNING_BYTES = 400 * 1024 * 1024;
/** En dessous, le fichier n'est pas un modèle (souvent un pointeur Git LFS de 130 octets). */
export const MODEL_MIN_ONNX_BYTES = 1024;

export type ModelDtype = "q8" | "fp32";
/** `dev` : raccourci de développement, voir `dev-model.ts`. */
export type ModelOrigin = "cache" | "memory" | "dev";

/** Ce que l'interface affiche d'un modèle. Sérialisable. */
export interface ModelInfo {
  /** `_name_or_path` de config.json, sinon nom du dossier. */
  name: string;
  /** Somme des tailles des fichiers retenus, en octets. */
  sizeBytes: number;
  /** Types d'étiquettes reconnus par le modèle, sans préfixe BIO et sans « O » (`PER`, `ORG`, `LOC`…). */
  labels: string[];
  dtype: ModelDtype;
  /** Avertissements de validation, en français. */
  warnings: string[];
  /** Où se trouvent les fichiers : Cache Storage, mémoire de la session, ou dossier de développement. */
  origin: ModelOrigin;
}

// ---------------------------------------------------------------------------
// 1. Choix des fichiers dans la sélection de l'utilisateur
// ---------------------------------------------------------------------------

/** Fichier proposé par le sélecteur : chemin relatif au dossier choisi (ou simple nom). */
export interface CandidateFile {
  path: string;
  size: number;
}

export interface ModelSelection {
  /** Nom du dossier du modèle, ou `""` si la sélection ne le donne pas (fichiers choisis un par un). */
  folderName: string;
  /** Nom canonique du fichier (`config.json`, `onnx/model_quantized.onnx`…) → chemin dans la sélection. */
  files: Map<string, string>;
  dtype: ModelDtype;
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

const REQUIRED = ["config.json", "tokenizer.json", "tokenizer_config.json"] as const;
const OPTIONAL = ["special_tokens_map.json"] as const;
const ONNX_Q8 = "onnx/model_quantized.onnx";
const ONNX_FP32 = "onnx/model.onnx";

/** Chemin normalisé : séparateurs `/`, sans `./` ni `/` initial. */
export function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^(\.\/|\/)+/, "");
}

function findFile(paths: readonly string[], root: string, name: string): string | undefined {
  const exact = `${root}${name}`;
  if (paths.includes(exact)) return exact;
  // Sélection de fichiers un par un (pas de dossier) : l'ONNX arrive sous son seul nom.
  if (root === "" && name.startsWith("onnx/")) {
    const bare = name.slice("onnx/".length);
    const hits = paths.filter((p) => !p.includes("/") && p === bare);
    return hits[0];
  }
  return undefined;
}

/**
 * Repère les fichiers du modèle dans une sélection. Tolère que l'utilisateur ait choisi le dossier
 * du modèle, un dossier parent (un seul modèle à l'intérieur), ou sélectionné les fichiers un par un.
 * Le dossier `onnx/` seul ne suffit pas : `config.json` et le tokenizer sont dans son parent.
 */
export function selectModelFiles(candidates: readonly CandidateFile[]): Result<ModelSelection> {
  const paths = candidates.map((c) => normalizePath(c.path));
  if (paths.length === 0) return { ok: false, error: "Aucun fichier n'a été sélectionné." };

  const roots = [
    ...new Set(
      paths
        .filter((p) => p.split("/").pop() === "config.json")
        .map((p) => p.slice(0, -"config.json".length)),
    ),
  ];
  if (roots.length === 0) {
    const onlyOnnx = paths.every((p) => p.endsWith(".onnx"));
    return {
      ok: false,
      error: onlyOnnx
        ? "Seul le fichier du modèle (.onnx) a été sélectionné : choisissez le dossier du modèle, celui qui contient config.json, tokenizer.json et le dossier onnx/."
        : "config.json est introuvable : choisissez le dossier du modèle (celui qui contient config.json, tokenizer.json et le dossier onnx/).",
    };
  }

  const attempts = roots.map((root) => {
    const files = new Map<string, string>();
    const missing: string[] = [];
    for (const name of REQUIRED) {
      const found = findFile(paths, root, name);
      if (found) files.set(name, found);
      else missing.push(name);
    }
    for (const name of OPTIONAL) {
      const found = findFile(paths, root, name);
      if (found) files.set(name, found);
    }
    const q8 = findFile(paths, root, ONNX_Q8);
    const fp32 = findFile(paths, root, ONNX_FP32);
    let dtype: ModelDtype = "q8";
    if (q8) files.set(ONNX_Q8, q8);
    else if (fp32) {
      files.set(ONNX_FP32, fp32);
      dtype = "fp32";
    } else missing.push("onnx/model_quantized.onnx (ou onnx/model.onnx)");
    const folderName = root === "" ? "" : (root.slice(0, -1).split("/").pop() ?? "");
    return { root, files, missing, dtype, folderName };
  });

  const complete = attempts.filter((a) => a.missing.length === 0);
  if (complete.length > 1) {
    return {
      ok: false,
      error:
        "Plusieurs modèles ont été trouvés dans ce dossier : choisissez le dossier d'un seul modèle.",
    };
  }
  const chosen = complete[0];
  if (!chosen) {
    const first = attempts[0];
    return {
      ok: false,
      error: `Fichier(s) manquant(s) : ${first?.missing.join(", ") ?? "?"}.`,
    };
  }
  return {
    ok: true,
    value: { folderName: chosen.folderName, files: chosen.files, dtype: chosen.dtype },
  };
}

// ---------------------------------------------------------------------------
// 2. Validation du contenu
// ---------------------------------------------------------------------------

export interface ValidationInput {
  /** Nom du dossier du modèle (peut être vide). */
  folderName: string;
  configText: string;
  tokenizerText: string;
  tokenizerConfigText: string;
  dtype: ModelDtype;
  /** Taille du fichier ONNX, en octets. */
  onnxSize: number;
  /** Taille de tous les fichiers retenus, en octets. */
  totalSize: number;
}

export const NOT_NER_MESSAGE =
  "Ce modèle ne semble pas être un modèle de reconnaissance d'entités compatible.";

function parseObject(text: string): Record<string, unknown> | undefined {
  try {
    const value: unknown = JSON.parse(text);
    return value !== null && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

/** `_name_or_path` s'il ressemble à un identifiant de dépôt, pas à un chemin de machine. */
function readableName(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const v = value.trim();
  if (v === "" || v.length > 120 || /^[/.~]|[\\:]/.test(v)) return undefined;
  return v;
}

/** Valide le contenu des fichiers et prépare ce que l'interface affiche. Pure. */
export function validateModel(input: ValidationInput): Result<Omit<ModelInfo, "origin">> {
  const config = parseObject(input.configText);
  if (!config)
    return { ok: false, error: "config.json est illisible (ce n'est pas du JSON valide)." };
  if (!parseObject(input.tokenizerText)) {
    return { ok: false, error: "tokenizer.json est illisible (ce n'est pas du JSON valide)." };
  }
  if (!parseObject(input.tokenizerConfigText)) {
    return {
      ok: false,
      error: "tokenizer_config.json est illisible (ce n'est pas du JSON valide).",
    };
  }
  const id2label = config["id2label"];
  if (id2label === null || typeof id2label !== "object" || Array.isArray(id2label)) {
    return { ok: false, error: NOT_NER_MESSAGE };
  }
  const rawLabels = Object.values(id2label as Record<string, unknown>).filter(
    (l): l is string => typeof l === "string",
  );
  const types = new Set(rawLabels.map((l) => mapLabel(l)).filter((t) => t !== null));
  if (types.size === 0) return { ok: false, error: NOT_NER_MESSAGE };

  if (input.onnxSize < MODEL_MIN_ONNX_BYTES) {
    return {
      ok: false,
      error:
        "Le fichier du modèle (.onnx) est vide ou presque : il s'agit sans doute d'un pointeur Git LFS et non du modèle lui-même. Retéléchargez-le avec la commande indiquée.",
    };
  }
  const warnings: string[] = [];
  if (input.onnxSize > MODEL_LARGE_WARNING_BYTES) {
    warnings.push(
      `Le fichier du modèle pèse ${formatBytes(input.onnxSize)} : le chargement sera long et gourmand en mémoire.`,
    );
  }
  if (!types.has("PERSON")) {
    warnings.push("Ce modèle ne reconnaît pas les personnes (étiquette PER absente).");
  }
  if (input.dtype === "fp32") {
    warnings.push(
      "Seule la version non quantifiée (model.onnx) est présente : plus lourde et plus lente.",
    );
  }
  const labels = [...new Set(rawLabels.map(stripPrefix).filter((l) => l.toUpperCase() !== "O"))];
  return {
    ok: true,
    value: {
      name: readableName(config["_name_or_path"]) ?? (input.folderName || "modèle local"),
      sizeBytes: input.totalSize,
      labels,
      dtype: input.dtype,
      warnings,
    },
  };
}

/** « 138,3 Mo » (unités décimales, virgule française). */
export function formatBytes(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1).replace(".", ",")} Go`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1).replace(".", ",")} Mo`;
  return `${Math.max(1, Math.round(bytes / 1e3))} ko`;
}

// ---------------------------------------------------------------------------
// 3. Préparation depuis les `File` du sélecteur
// ---------------------------------------------------------------------------

/** Fichier du sélecteur (`File`), ou tout `Blob` nommé. */
export interface PickedFile extends Blob {
  readonly name: string;
  readonly webkitRelativePath?: string;
}

export interface PreparedModel {
  info: Omit<ModelInfo, "origin">;
  /** Nom canonique → contenu. Les `Blob` sont des références (pas de copie des octets en mémoire). */
  blobs: Map<string, Blob>;
}

/** Sélection → validation → fichiers prêts à stocker. Ne lit en entier que les petits fichiers JSON. */
export async function prepareModel(picked: readonly PickedFile[]): Promise<Result<PreparedModel>> {
  const byPath = new Map<string, PickedFile>();
  for (const f of picked) byPath.set(normalizePath(f.webkitRelativePath || f.name), f);
  const selection = selectModelFiles([...byPath].map(([path, f]) => ({ path, size: f.size })));
  if (!selection.ok) return selection;
  const { files, dtype, folderName } = selection.value;

  const blobs = new Map<string, Blob>();
  let total = 0;
  for (const [name, path] of files) {
    const f = byPath.get(path);
    if (!f) continue;
    blobs.set(name, f);
    total += f.size;
  }
  const text = (name: string) => blobs.get(name)?.text() ?? Promise.resolve("");
  const onnx = blobs.get(dtype === "q8" ? ONNX_Q8 : ONNX_FP32);
  const validated = validateModel({
    folderName,
    configText: await text("config.json"),
    tokenizerText: await text("tokenizer.json"),
    tokenizerConfigText: await text("tokenizer_config.json"),
    dtype,
    onnxSize: onnx?.size ?? 0,
    totalSize: total,
  });
  if (!validated.ok) return validated;
  return { ok: true, value: { info: validated.value, blobs } };
}

// ---------------------------------------------------------------------------
// 4. Stockage dans Cache Storage
// ---------------------------------------------------------------------------

/** Sous-ensemble de `CacheStorage` utilisé ici (permet un faux en test). */
export interface CacheStorageLike {
  open(name: string): Promise<CacheLike>;
  delete(name: string): Promise<boolean>;
}
export interface CacheLike {
  match(request: string): Promise<Response | undefined>;
  put(request: string, response: Response): Promise<void>;
  keys(): Promise<readonly { url: string }[]>;
}

function defaultStorage(): CacheStorageLike | undefined {
  return typeof caches === "undefined" ? undefined : (caches as unknown as CacheStorageLike);
}

/** Dossier synthétique des fichiers du modèle, à partir de la racine de l'application. */
export function modelBaseUrl(appRoot: string | URL): URL {
  return new URL("models/local/", appRoot);
}

function responseFor(blob: Blob, name: string): Response {
  const type = name.endsWith(".json") ? "application/json" : "application/octet-stream";
  return new Response(blob, {
    headers: { "content-type": type, "content-length": String(blob.size) },
  });
}

export type StoreOutcome =
  | { where: "cache" }
  /** Cache Storage inaccessible : les fichiers ne vivent que dans cette session. */
  | { where: "memory"; reason: string };

/**
 * Copie le modèle dans Cache Storage, en remplaçant le précédent. En cas d'échec (cache absent, navigation
 * privée, quota), ne laisse rien d'incomplet et indique que le modèle reste en mémoire.
 */
export async function storeModel(
  prepared: PreparedModel,
  appRoot: string | URL,
  storage: CacheStorageLike | undefined = defaultStorage(),
): Promise<StoreOutcome> {
  if (!storage) {
    return { where: "memory", reason: "Le stockage du navigateur n'est pas disponible." };
  }
  try {
    await storage.delete(MODEL_CACHE_NAME);
    const cache = await storage.open(MODEL_CACHE_NAME);
    const base = modelBaseUrl(appRoot);
    for (const [name, blob] of prepared.blobs) {
      await cache.put(new URL(name, base).href, responseFor(blob, name));
    }
    // Fiche écrite en dernier : sa présence prouve que la copie est complète.
    const meta = JSON.stringify({ ...prepared.info, origin: "cache" } satisfies ModelInfo);
    await cache.put(
      new URL(MODEL_META_FILE, base).href,
      responseFor(new Blob([meta]), MODEL_META_FILE),
    );
    return { where: "cache" };
  } catch (err) {
    await storage.delete(MODEL_CACHE_NAME).catch(() => undefined);
    const quota = err instanceof Error && err.name === "QuotaExceededError";
    return {
      where: "memory",
      reason: quota
        ? "Le navigateur n'a pas assez d'espace de stockage pour conserver le modèle."
        : "Le navigateur refuse de conserver le modèle (navigation privée ?).",
    };
  }
}

/** Fiche du modèle stocké, ou `undefined` si aucun modèle complet n'est en cache. */
export async function readStoredModel(
  appRoot: string | URL,
  storage: CacheStorageLike | undefined = defaultStorage(),
): Promise<ModelInfo | undefined> {
  if (!storage) return undefined;
  try {
    // `open` créerait un cache vide : on n'ouvre que s'il existe déjà.
    const cache = await openExisting(storage);
    if (!cache) return undefined;
    const res = await matchByName(cache, appRoot, MODEL_META_FILE);
    if (!res) return undefined;
    const meta = parseObject(await res.text());
    if (!meta || typeof meta["name"] !== "string" || !Array.isArray(meta["labels"]))
      return undefined;
    return { ...(meta as unknown as ModelInfo), origin: "cache" };
  } catch {
    return undefined;
  }
}

/**
 * Fichier du modèle par son nom. La page et le worker calculent la racine de l'application chacun à leur
 * manière : si l'URL exacte manque, repli sur la fin de l'URL (`/models/local/<fichier>`).
 */
async function matchByName(
  cache: CacheLike,
  appRoot: string | URL,
  name: string,
): Promise<Response | undefined> {
  const exact = await cache.match(new URL(name, modelBaseUrl(appRoot)).href);
  if (exact) return exact;
  const suffix = `/models/local/${name}`;
  const hit = (await cache.keys()).find((r) => new URL(r.url).pathname.endsWith(suffix));
  return hit ? cache.match(hit.url) : undefined;
}

/** Supprime le cache du modèle. */
export async function forgetStoredModel(
  storage: CacheStorageLike | undefined = defaultStorage(),
): Promise<void> {
  await storage?.delete(MODEL_CACHE_NAME);
}

async function openExisting(storage: CacheStorageLike): Promise<CacheLike | undefined> {
  const raw = storage as Partial<{ has(name: string): Promise<boolean> }> & CacheStorageLike;
  if (raw.has && !(await raw.has(MODEL_CACHE_NAME))) return undefined;
  return storage.open(MODEL_CACHE_NAME);
}

// ---------------------------------------------------------------------------
// 5. Sources de fichiers pour le moteur NER (voir `src/ner/local-files.ts`)
// ---------------------------------------------------------------------------

/** Lit les fichiers dans Cache Storage. Lève `LocalModelMissingError` si le modèle n'y est pas complet. */
export async function cacheFileSource(
  appRoot: string | URL,
  storage: CacheStorageLike | undefined = defaultStorage(),
): Promise<{ info: ModelInfo; source: LocalModelFileSource }> {
  const info = await readStoredModel(appRoot, storage);
  if (!info || !storage) throw new LocalModelMissingError();
  const cache = await storage.open(MODEL_CACHE_NAME);
  const source: LocalModelFileSource = (name) => matchByName(cache, appRoot, name);
  return { info, source };
}

/** Lit les fichiers en mémoire (session sans Cache Storage). Chaque appel renvoie une `Response` neuve. */
export function blobFileSource(blobs: ReadonlyMap<string, Blob>): LocalModelFileSource {
  return (name) => {
    const blob = blobs.get(name);
    return blob ? responseFor(blob, name) : undefined;
  };
}
