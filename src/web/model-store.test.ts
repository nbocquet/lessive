import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import { modelFileLimit } from "./model-limits.ts";
import { LocalModelMissingError } from "../ner/local-files.ts";
import {
  MODEL_CACHE_NAME,
  MODEL_META_FILE,
  blobFileSource,
  cacheFileSource,
  forgetStoredModel,
  formatBytes,
  prepareModel,
  readStoredModel,
  selectModelFiles,
  storeModel,
  validateModel,
  type CacheLike,
  type CacheStorageLike,
  type PickedFile,
  type ValidationInput,
} from "./model-store.ts";

const ROOT = "https://lessive.example/app/";
const CONFIG = JSON.stringify({
  _name_or_path: "org/ner-synthetique",
  id2label: {
    "0": "O",
    "1": "B-PER",
    "2": "I-PER",
    "3": "B-ORG",
    "4": "I-ORG",
    "5": "B-LOC",
    "6": "I-LOC",
  },
});

const input = (over: Partial<ValidationInput> = {}): ValidationInput => ({
  folderName: "mon-dossier",
  configText: CONFIG,
  tokenizerText: "{}",
  tokenizerConfigText: "{}",
  dtype: "q8",
  onnxSize: 130e6,
  totalSize: 138e6,
  ...over,
});

const cand = (...paths: string[]) => paths.map((path) => ({ path, size: 10 }));
const FULL = [
  "config.json",
  "tokenizer.json",
  "tokenizer_config.json",
  "special_tokens_map.json",
  "onnx/model_quantized.onnx",
];

describe("sélection des fichiers", () => {
  it("accepte le dossier du modèle", () => {
    const r = selectModelFiles(cand(...FULL.map((f) => `modele/${f}`), "modele/README.md"));
    expect(r.ok && [...r.value.files.keys()].sort()).toEqual([...FULL].sort());
    expect(r.ok && r.value.folderName).toBe("modele");
    expect(r.ok && r.value.dtype).toBe("q8");
  });

  it("tolère le dossier parent d'un seul modèle", () => {
    const r = selectModelFiles(cand(...FULL.map((f) => `telechargements/modele/${f}`)));
    expect(r.ok && r.value.folderName).toBe("modele");
  });

  it("refuse un dossier parent contenant plusieurs modèles", () => {
    const r = selectModelFiles(cand(...FULL.map((f) => `a/${f}`), ...FULL.map((f) => `b/${f}`)));
    expect(r.ok).toBe(false);
  });

  it("explique qu'onnx/ seul ne suffit pas", () => {
    const r = selectModelFiles(cand("onnx/model_quantized.onnx"));
    expect(!r.ok && r.error).toContain("dossier du modèle");
  });

  it("accepte des fichiers choisis un par un, ONNX sous son seul nom", () => {
    const r = selectModelFiles(
      cand("config.json", "tokenizer.json", "tokenizer_config.json", "model_quantized.onnx"),
    );
    expect(r.ok && r.value.files.get("onnx/model_quantized.onnx")).toBe("model_quantized.onnx");
    expect(r.ok && r.value.folderName).toBe("");
  });

  it("se rabat sur model.onnx et signale le fichier manquant sinon", () => {
    const fp32 = selectModelFiles(
      cand("m/config.json", "m/tokenizer.json", "m/tokenizer_config.json", "m/onnx/model.onnx"),
    );
    expect(fp32.ok && fp32.value.dtype).toBe("fp32");
    const missing = selectModelFiles(cand("m/config.json", "m/tokenizer.json"));
    expect(!missing.ok && missing.error).toContain("tokenizer_config.json");
    expect(!missing.ok && missing.error).toContain("onnx/model_quantized.onnx");
  });

  it("normalise les chemins Windows et refuse une sélection vide", () => {
    const r = selectModelFiles(cand(...FULL.map((f) => `m\\${f.replace("/", "\\")}`)));
    expect(r.ok).toBe(true);
    expect(selectModelFiles([]).ok).toBe(false);
  });
});

describe("validation du contenu", () => {
  it("décrit un modèle valide", () => {
    const r = validateModel(input());
    expect(r.ok && r.value).toMatchObject({
      name: "org/ner-synthetique",
      sizeBytes: 138e6,
      labels: ["PER", "ORG", "LOC"],
      dtype: "q8",
      warnings: [],
    });
  });

  it("prend le nom du dossier si _name_or_path est un chemin de machine", () => {
    const config = JSON.stringify({ _name_or_path: "/home/x/model", id2label: { 0: "B-PER" } });
    const r = validateModel(input({ configText: config }));
    expect(r.ok && r.value.name).toBe("mon-dossier");
  });

  it("refuse un modèle sans étiquettes d'entités avec le message prévu", () => {
    for (const config of [
      JSON.stringify({ id2label: { 0: "POSITIVE", 1: "NEGATIVE" } }),
      JSON.stringify({ architectures: ["BertModel"] }),
      JSON.stringify({ id2label: { 0: "B-MISC" } }),
    ]) {
      const r = validateModel(input({ configText: config }));
      expect(!r.ok && r.error).toBe(
        "Ce modèle ne semble pas être un modèle de reconnaissance d'entités compatible.",
      );
    }
  });

  it("refuse les JSON illisibles", () => {
    expect(validateModel(input({ configText: "{" })).ok).toBe(false);
    expect(validateModel(input({ tokenizerText: "pas du json" })).ok).toBe(false);
    expect(validateModel(input({ tokenizerConfigText: "[]" })).ok).toBe(false);
  });

  it("refuse un pointeur Git LFS et avertit au-delà de 400 Mo", () => {
    const lfs = validateModel(input({ onnxSize: 130 }));
    expect(!lfs.ok && lfs.error).toContain("Git LFS");
    const big = validateModel(input({ onnxSize: 450e6 }));
    expect(big.ok && big.value.warnings.join(" ")).toContain("450,0 Mo");
  });

  it("avertit quand seule la version non quantifiée est présente", () => {
    const r = validateModel(input({ dtype: "fp32" }));
    expect(r.ok && r.value.warnings.join(" ")).toContain("model.onnx");
  });

  it("formate les tailles", () => {
    expect(formatBytes(138_300_000)).toBe("138,3 Mo");
    expect(formatBytes(2_500)).toBe("3 ko");
  });
});

// ---- Faux Cache Storage ----

function fakeStorage(opts: { failPut?: Error } = {}): CacheStorageLike & {
  stores: Map<string, Map<string, Response>>;
} {
  const stores = new Map<string, Map<string, Response>>();
  const open = (name: string): CacheLike => {
    let m = stores.get(name);
    if (!m) stores.set(name, (m = new Map()));
    const entries = m;
    return {
      match: (url) => Promise.resolve(entries.get(url)?.clone()),
      put: (url, res) => {
        if (opts.failPut) return Promise.reject(opts.failPut);
        entries.set(url, res);
        return Promise.resolve();
      },
      keys: () => Promise.resolve([...entries.keys()].map((url) => ({ url }))),
    };
  };
  return {
    stores,
    has: (name: string) => Promise.resolve(stores.has(name)),
    open: (name) => Promise.resolve(open(name)),
    delete: (name) => Promise.resolve(stores.delete(name)),
  } as CacheStorageLike & { stores: Map<string, Map<string, Response>> };
}

function picked(name: string, path: string, content: string | Uint8Array): PickedFile {
  const blob = new Blob([content as BlobPart]);
  return Object.assign(blob, { name, webkitRelativePath: path });
}

const syntheticFiles = (): PickedFile[] => [
  picked("config.json", "m/config.json", CONFIG),
  picked("tokenizer.json", "m/tokenizer.json", "{}"),
  picked("tokenizer_config.json", "m/tokenizer_config.json", "{}"),
  picked("model_quantized.onnx", "m/onnx/model_quantized.onnx", new Uint8Array(2048)),
];

describe("plafonds avant lecture locale", () => {
  it.each(FULL)("refuse %s trop volumineux avant toute lecture", async (name) => {
    const files = syntheticFiles();
    if (name === "special_tokens_map.json") {
      files.push(picked(name, `m/${name}`, "{}"));
    }
    const target = files.find((f) => f.webkitRelativePath === `m/${name}`)!;
    // Métadonnées seules : aucun gros tampon n'est alloué pour ce test.
    Object.defineProperty(target, "size", { value: modelFileLimit(name)! + 1 });
    const reads = files.map((f) => vi.spyOn(f, "text"));
    const result = await prepareModel(files);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("trop volumineux");
    for (const read of reads) expect(read).not.toHaveBeenCalled();
  });
});

describe("stockage dans Cache Storage", () => {
  it("copie, relit et oublie le modèle, uniquement sous des URL synthétiques de même origine", async () => {
    const prepared = await prepareModel(syntheticFiles());
    if (!prepared.ok) throw new Error(prepared.error);
    const storage = fakeStorage();
    expect(await storeModel(prepared.value, ROOT, storage)).toEqual({ where: "cache" });

    const keys = [...(storage.stores.get(MODEL_CACHE_NAME)?.keys() ?? [])].sort();
    expect(keys).toEqual(
      [
        "config.json",
        "tokenizer.json",
        "tokenizer_config.json",
        "onnx/model_quantized.onnx",
        MODEL_META_FILE,
      ]
        .map((f) => `${ROOT}models/local/${f}`)
        .sort(),
    );

    const info = await readStoredModel(ROOT, storage);
    expect(info).toMatchObject({ name: "org/ner-synthetique", origin: "cache", dtype: "q8" });

    const { source } = await cacheFileSource(ROOT, storage);
    expect(await (await source("config.json"))?.text()).toBe(CONFIG);
    expect((await (await source("onnx/model_quantized.onnx"))?.arrayBuffer())?.byteLength).toBe(
      2048,
    );
    expect(await source("special_tokens_map.json")).toBeUndefined();

    // La racine vue par le worker peut différer : repli sur la fin de l'URL.
    const other = await cacheFileSource("https://lessive.example/autre/", storage);
    expect(await (await other.source("tokenizer.json"))?.text()).toBe("{}");

    await forgetStoredModel(storage);
    expect(await readStoredModel(ROOT, storage)).toBeUndefined();
    await expect(cacheFileSource(ROOT, storage)).rejects.toBeInstanceOf(LocalModelMissingError);
  });

  it("remplace le modèle précédent", async () => {
    const storage = fakeStorage();
    const a = await prepareModel(syntheticFiles());
    if (!a.ok) throw new Error(a.error);
    await storeModel(a.value, ROOT, storage);
    const config = JSON.stringify({ _name_or_path: "org/autre", id2label: { 0: "B-PER" } });
    const b = await prepareModel(
      [
        picked("config.json", "n/config.json", config),
        ...syntheticFiles()
          .slice(1)
          .map((f) => picked(f.name, `n/${f.webkitRelativePath?.slice(2)}`, "{}")),
      ].map((f) =>
        f.name.endsWith(".onnx")
          ? picked(f.name, f.webkitRelativePath ?? f.name, new Uint8Array(2048))
          : f,
      ),
    );
    if (!b.ok) throw new Error(b.error);
    await storeModel(b.value, ROOT, storage);
    expect((await readStoredModel(ROOT, storage))?.name).toBe("org/autre");
  });

  it("garde le modèle en mémoire quand Cache Storage est absent ou refuse l'écriture", async () => {
    const prepared = await prepareModel(syntheticFiles());
    if (!prepared.ok) throw new Error(prepared.error);
    const absent = await storeModel(prepared.value, ROOT, undefined);
    expect(absent.where === "memory" && absent.reason).toContain("n'est pas disponible");

    const quota = Object.assign(new Error("plein"), { name: "QuotaExceededError" });
    const storage = fakeStorage({ failPut: quota });
    const full = await storeModel(prepared.value, ROOT, storage);
    expect(full.where === "memory" && full.reason).toContain("espace");
    expect(storage.stores.has(MODEL_CACHE_NAME)).toBe(false);

    const source = blobFileSource(prepared.value.blobs);
    expect(await (await source("config.json"))?.text()).toBe(CONFIG);
    // Une Response neuve à chaque lecture.
    expect(await (await source("config.json"))?.text()).toBe(CONFIG);
    expect(source("absent.json")).toBeUndefined();
  });

  it("ne détecte rien sans cache ou avec une fiche absente", async () => {
    expect(await readStoredModel(ROOT, undefined)).toBeUndefined();
    expect(await readStoredModel(ROOT, fakeStorage())).toBeUndefined();
  });
});

const MODEL_DIR =
  "/mnt/user-data/uploads/lessive/models/Xenova/distilbert-base-multilingual-cased-ner-hrl/";
describe.skipIf(!existsSync(`${MODEL_DIR}onnx/model_quantized.onnx`))("modèle réel", () => {
  it("passe la validation et le stockage avec les vrais octets", { timeout: 60_000 }, async () => {
    const files: PickedFile[] = [];
    for (const f of [
      ...FULL.filter((x) => x !== "onnx/model_quantized.onnx"),
      "onnx/model_quantized.onnx",
    ]) {
      try {
        files.push(
          picked(f.split("/").pop() ?? f, `distil/${f}`, await readFile(`${MODEL_DIR}${f}`)),
        );
      } catch {
        // special_tokens_map.json est facultatif
      }
    }
    const prepared = await prepareModel(files);
    if (!prepared.ok) throw new Error(prepared.error);
    expect(prepared.value.info.labels).toEqual(expect.arrayContaining(["PER", "ORG", "LOC"]));
    expect(prepared.value.info.sizeBytes).toBeGreaterThan(100e6);
    const storage = fakeStorage();
    expect((await storeModel(prepared.value, ROOT, storage)).where).toBe("cache");
    const { source } = await cacheFileSource(ROOT, storage);
    const onnx = await source("onnx/model_quantized.onnx");
    expect((await onnx?.arrayBuffer())?.byteLength).toBe(
      prepared.value.blobs.get("onnx/model_quantized.onnx")?.size,
    );
  });
});
