import { afterEach, describe, expect, it, vi } from "vitest";
import {
  bundledSize,
  fetchBundledModel,
  parseManifest,
  probeBundledModel,
  type BundledManifest,
} from "./bundled-model.ts";
import { MAX_MODEL_JSON_BYTES } from "./model-limits.ts";

const ROOT = "https://lessive.test/app/";

const CONFIG = JSON.stringify({
  _name_or_path: "Exemple/modele-ner",
  id2label: { "0": "O", "1": "I-PER", "2": "I-LOC" },
});
const ONNX = new Uint8Array(new ArrayBuffer(4096));

const CONTENT: Record<string, string | Uint8Array> = {
  "config.json": CONFIG,
  "tokenizer.json": "{}",
  "tokenizer_config.json": "{}",
  "onnx/model_quantized.onnx": ONNX,
};

const size = (v: string | Uint8Array) =>
  typeof v === "string" ? new TextEncoder().encode(v).length : v.length;

function manifest(over: Partial<BundledManifest> = {}): BundledManifest {
  return {
    name: "Xenova/exemple-ner",
    license: "MIT",
    attribution: "Modèle d'exemple.",
    licenseFile: "LICENSE.txt",
    files: Object.entries(CONTENT).map(([name, v]) => ({ name, size: size(v) })),
    ...over,
  };
}

/** Faux serveur : sert `files` sous `<ROOT>models/bundled/`, 404 sinon. Note les URL demandées. */
function serve(files: Record<string, string | Uint8Array | Response>) {
  const seen: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((input: URL | string) => {
      const href = String(input);
      seen.push(href);
      const name = href.startsWith(`${ROOT}models/bundled/`)
        ? href.slice(`${ROOT}models/bundled/`.length)
        : "";
      const body = files[name];
      if (body instanceof Response) return Promise.resolve(body);
      if (body === undefined) return Promise.resolve(new Response("introuvable", { status: 404 }));
      const type = name.endsWith(".json") ? "application/json" : "application/octet-stream";
      const payload = typeof body === "string" ? body : new Blob([body as Uint8Array<ArrayBuffer>]);
      return Promise.resolve(new Response(payload, { headers: { "content-type": type } }));
    }),
  );
  return seen;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("parseManifest", () => {
  it("refuse une fiche avec un fichier trop gros, inconnu ou en double", () => {
    for (const file of [
      { name: "config.json", size: MAX_MODEL_JSON_BYTES + 1 },
      { name: "extra.json", size: 10 },
      manifest().files[0]!,
    ]) {
      expect(parseManifest(manifest({ files: [...manifest().files, file] }))).toBeUndefined();
    }
  });
  it("accepte une fiche complète", () => {
    expect(parseManifest(manifest())).toEqual(manifest());
  });

  it("refuse une fiche sans fichier ONNX", () => {
    const m = manifest();
    m.files = m.files.filter((f) => !f.name.endsWith(".onnx"));
    expect(parseManifest(m)).toBeUndefined();
  });

  it("refuse un nom de fichier qui sort du dossier", () => {
    const m = manifest();
    m.files.push({ name: "../index.html", size: 10 });
    expect(parseManifest(m)).toBeUndefined();
    expect(
      parseManifest({ ...manifest(), licenseFile: "https://ailleurs.test/x" }),
    ).toBeUndefined();
  });

  it("refuse une taille invalide ou un champ manquant", () => {
    const m = manifest();
    m.files[0] = { name: "config.json", size: -1 };
    expect(parseManifest(m)).toBeUndefined();
    expect(parseManifest({ ...manifest(), license: "" })).toBeUndefined();
    expect(parseManifest(null)).toBeUndefined();
  });

  it("calcule la taille totale", () => {
    expect(bundledSize(manifest())).toBe(Object.values(CONTENT).reduce((s, v) => s + size(v), 0));
  });
});

describe("probeBundledModel", () => {
  it("borne aussi la lecture de la fiche avant de la parser", async () => {
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(64 * 1024 + 1));
      },
      cancel,
    });
    serve({ "bundle.json": new Response(body) });
    expect(await probeBundledModel(ROOT)).toBeUndefined();
    expect(cancel).toHaveBeenCalledOnce();
  });
  it("lit bundle.json à la racine de l'application, sur la même origine", async () => {
    const seen = serve({ "bundle.json": JSON.stringify(manifest()) });
    expect(await probeBundledModel(ROOT)).toEqual(manifest());
    expect(seen).toEqual([`${ROOT}models/bundled/bundle.json`]);
  });

  it("répond « absent » sur 404 ou page HTML de repli", async () => {
    serve({});
    expect(await probeBundledModel(ROOT)).toBeUndefined();
    serve({
      "bundle.json": new Response("<!doctype html>", { headers: { "content-type": "text/html" } }),
    });
    expect(await probeBundledModel(ROOT)).toBeUndefined();
  });
});

describe("fetchBundledModel", () => {
  it("refuse les métadonnées hors plafond avant la première requête", async () => {
    const seen = serve(CONTENT);
    const m = manifest();
    m.files[0]!.size = MAX_MODEL_JSON_BYTES + 1;
    expect((await fetchBundledModel(ROOT, m)).ok).toBe(false);
    expect(seen).toEqual([]);
  });

  it.each([undefined, "1"])(
    "annule un flux qui dépasse la taille annoncée, Content-Length=%s",
    async (contentLength) => {
      const cancel = vi.fn();
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(CONFIG));
          controller.enqueue(new Uint8Array(1));
        },
        cancel,
      });
      const headers: Record<string, string> =
        contentLength === undefined ? {} : { "Content-Length": contentLength };
      const seen = serve({ ...CONTENT, "config.json": new Response(body, { headers }) });
      const result = await fetchBundledModel(ROOT, manifest());
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toContain("interrompu");
      expect(cancel).toHaveBeenCalledOnce();
      expect(seen).toEqual([`${ROOT}models/bundled/config.json`]);
    },
  );

  it("renvoie une erreur contrôlée si le flux échoue", async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.error(new Error("échec synthétique"));
      },
    });
    serve({ ...CONTENT, "config.json": new Response(body) });
    expect((await fetchBundledModel(ROOT, manifest())).ok).toBe(false);
  });
  it("télécharge, valide et nomme le modèle d'après la fiche", async () => {
    const seen = serve(CONTENT);
    const progress: number[] = [];
    const result = await fetchBundledModel(ROOT, manifest(), (p) => progress.push(p));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.info.name).toBe("Xenova/exemple-ner");
    expect(result.value.info.labels).toEqual(["PER", "LOC"]);
    expect([...result.value.blobs.keys()].sort()).toEqual(Object.keys(CONTENT).sort());
    expect(progress.at(-1)).toBe(1);
    expect(seen.every((u) => u.startsWith(`${ROOT}models/bundled/`))).toBe(true);
  });

  it("signale un fichier manquant", async () => {
    const rest = Object.fromEntries(
      Object.entries(CONTENT).filter(([name]) => name !== "tokenizer.json"),
    );
    serve(rest);
    const result = await fetchBundledModel(ROOT, manifest());
    expect(result).toEqual({
      ok: false,
      error: "Fichier du modèle fourni introuvable : tokenizer.json.",
    });
  });

  it("signale un fichier tronqué", async () => {
    serve({ ...CONTENT, "onnx/model_quantized.onnx": new Uint8Array(2048) });
    const result = await fetchBundledModel(ROOT, manifest());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("incomplet");
  });

  it("refuse un modèle qui n'est pas un modèle de reconnaissance d'entités", async () => {
    const config = JSON.stringify({ id2label: { "0": "NEGATIVE", "1": "POSITIVE" } });
    serve({ ...CONTENT, "config.json": config });
    const m = manifest();
    m.files[0] = { name: "config.json", size: size(config) };
    const result = await fetchBundledModel(ROOT, m);
    expect(result.ok).toBe(false);
  });
});
