import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAnalyzer } from "../core/analyzer/analyzer.ts";
import type { NerEngine } from "../core/types/index.ts";
import { createModelFileSource, guardNer, loadNer } from "./ner.ts";

const fake = vi.hoisted(() => ({
  load: vi.fn<() => Promise<void>>(),
  dispose: vi.fn<() => Promise<void>>(),
  options: vi.fn(),
  env: {} as Record<string, unknown>,
}));
vi.mock("@huggingface/transformers", () => ({ env: fake.env, LogLevel: { NONE: 50 } }));
vi.mock("../ner/transformers-engine.ts", () => ({
  TransformersNerEngine: class {
    constructor(options: unknown) {
      fake.options(options);
    }
    load = fake.load;
    dispose = fake.dispose;
  },
}));

const folders: string[] = [];
async function folder() {
  const path = await mkdtemp(resolve(tmpdir(), "lessive-ner-"));
  folders.push(path);
  return path;
}
afterEach(async () => {
  await Promise.all(folders.splice(0).map((path) => rm(path, { recursive: true, force: true })));
  vi.clearAllMocks();
  fake.load.mockReset();
  fake.dispose.mockResolvedValue();
});

describe("lecture confinée du modèle", () => {
  it.skipIf(process.platform === "win32")(
    "refuse un fichier de modèle qui est un tube nommé sans attendre de producteur",
    async () => {
      const root = await folder();
      await promisify(execFile)("mkfifo", [resolve(root, "config.json")]);
      const script = `
        const { createModelFileSource } = await import(${JSON.stringify(new URL("./ner.ts", import.meta.url).href)});
        const source = await createModelFileSource(${JSON.stringify(root)});
        try { await source('config.json'); process.exitCode = 2; }
        catch { process.exitCode = 0; }
      `;
      const { stdout, stderr } = await promisify(execFile)(
        process.execPath,
        ["--input-type=module", "-e", script],
        { timeout: 2000 },
      );
      expect(stdout).toBe("");
      expect(stderr).toBe("");
    },
  );
  it("relit une Response indépendante et accepte un lien restant dans le dossier", async () => {
    const root = await folder();
    await writeFile(resolve(root, "config.json"), "{}");
    await symlink(resolve(root, "config.json"), resolve(root, "alias.json"));
    const source = await createModelFileSource(root);
    expect(await (await source("config.json"))?.text()).toBe("{}");
    expect(await (await source("alias.json"))?.text()).toBe("{}");
    expect(await source("missing.json")).toBeUndefined();
  });

  it("refuse traversée, chemins absolus, dossiers et liens sortants", async () => {
    const root = await folder();
    const other = await folder();
    await writeFile(resolve(other, "private.json"), "VALEUR_SYNTHETIQUE");
    await symlink(resolve(other, "private.json"), resolve(root, "escape.json"));
    await symlink(other, resolve(root, "external"));
    await mkdir(resolve(root, "directory"));
    const source = await createModelFileSource(root);
    for (const name of [
      "../private.json",
      resolve(other, "private.json"),
      "escape.json",
      "external/private.json",
      "directory",
      "a\\b",
      "a\0b",
    ]) {
      await expect(source(name)).rejects.toThrow();
    }
  });
});

describe("garde NER", () => {
  it("mémorise un échec absorbé par l'analyseur sans exposer le message brut", async () => {
    const engine: NerEngine = {
      load: vi.fn(async () => undefined),
      recognize: vi
        .fn()
        .mockResolvedValueOnce([])
        .mockRejectedValueOnce(new Error("VALEUR_SYNTHETIQUE")),
      dispose: vi.fn(async () => undefined),
    };
    const guarded = guardNer(engine);
    const analyzer = createAnalyzer([]);
    await analyzer.analyze("première ligne", { ner: guarded });
    expect(guarded.failed).toBe(false);
    await analyzer.analyze("deuxième ligne", { ner: guarded });
    expect(guarded.failed).toBe(true);
    await guarded.load();
    await guarded.dispose();
    expect(engine.load).toHaveBeenCalledOnce();
    expect(engine.dispose).toHaveBeenCalledOnce();
  });
});

describe("chargement NER", () => {
  async function model() {
    const root = await folder();
    await mkdir(resolve(root, "onnx"));
    for (const name of [
      "config.json",
      "tokenizer.json",
      "tokenizer_config.json",
      "onnx/model_quantized.onnx",
    ]) {
      await writeFile(resolve(root, name), "{}");
    }
    return root;
  }

  it("charge une seule fois sur CPU q8 sans réseau ni cache disque", async () => {
    fake.load.mockResolvedValue();
    const engine = await loadNer(await model());
    expect(fake.load).toHaveBeenCalledOnce();
    expect(fake.options).toHaveBeenCalledWith(
      expect.objectContaining({ device: "cpu", dtype: "q8" }),
    );
    expect(fake.env).toMatchObject({
      allowRemoteModels: false,
      useFS: false,
      useFSCache: false,
      useBrowserCache: false,
      logLevel: 50,
    });
    const fetch = fake.env.fetch as () => Promise<Response>;
    expect((await fetch()).status).toBe(404);
    await engine.dispose();
  });

  it("libère le moteur sur échec du chargement et remplace le diagnostic brut", async () => {
    fake.load.mockRejectedValue(new Error("VALEUR_SYNTHETIQUE"));
    await expect(loadNer(await model())).rejects.toThrow("NER_LOAD");
    expect(fake.dispose).toHaveBeenCalledOnce();
  });

  it("refuse les fichiers manquants avant de charger le moteur", async () => {
    await expect(loadNer(await folder())).rejects.toThrow("NER_LOAD");
    expect(fake.options).not.toHaveBeenCalled();
  });
});

const realModel = resolve("models/Xenova/camembert-ner");
const nativeRuntime = resolve(
  `node_modules/onnxruntime-node/bin/napi-v6/${process.platform}/${process.arch}/onnxruntime_binding.node`,
);
it.skipIf(
  !existsSync(resolve(realModel, "onnx/model_quantized.onnx")) || !existsSync(nativeRuntime),
)(
  "charge un vrai modèle local et reconnaît sans requête réseau",
  async () => {
    const script = `
      globalThis.fetch = () => { throw new Error('NETWORK_FORBIDDEN'); };
      const { loadNer } = await import(${JSON.stringify(new URL("./ner.ts", import.meta.url).href)});
      const engine = await loadNer(${JSON.stringify(realModel)});
      try {
        let n = 0;
        const detections = await engine.recognize('Le docteur Lorian Valtorin arrive.', { nextId: () => 'd' + ++n });
        if (!detections.some(d => d.entityType === 'PERSON')) throw new Error('RESULT_INVALID');
      } finally { await engine.dispose(); }
    `;
    const { stdout, stderr } = await promisify(execFile)(
      process.execPath,
      ["--input-type=module", "-e", script],
      { timeout: 60000 },
    );
    expect(stdout).toBe("");
    expect(stderr).toBe("");
  },
  65000,
);
