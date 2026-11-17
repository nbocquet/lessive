import { describe, expect, it } from "vitest";
import type { AnalysisContext, Detection, NerEngine } from "../core/types/index.ts";
import { AbortError } from "../core/recognizers/index.ts";
import type { NerRequest, NerResponse } from "./protocol.ts";
import { createNerWorkerHost } from "./worker-host.ts";
import { WorkerNerEngine, type NerWorkerLike } from "./worker-client.ts";

const SECRET = "Camille Rochat";

/** Faux worker : enregistre les requêtes ; le test fournit les réponses. */
class FakeWorker implements NerWorkerLike {
  sent: NerRequest[] = [];
  terminated = false;
  onmessage: NerWorkerLike["onmessage"] = null;
  onerror: NerWorkerLike["onerror"] = null;
  postMessage(message: NerRequest): void {
    this.sent.push(message);
  }
  terminate(): void {
    this.terminated = true;
  }
  reply(message: NerResponse): void {
    this.onmessage?.({ data: message });
  }
}

const makeCtx = (signal?: AbortSignal): AnalysisContext => {
  let n = 0;
  return { signal, nextId: () => `id${++n}` };
};

const wireDetection = {
  start: 0,
  end: 14,
  entityType: "PERSON" as const,
  score: 0.9,
  recognizerId: "ner/m",
  packId: "ner",
  source: "ner" as const,
  explanation: ["Modèle NER m : PERSON"],
};

describe("WorkerNerEngine (faux worker)", () => {
  it("load : envoie les options, relaie la progression, se résout sur « loaded »", async () => {
    const worker = new FakeWorker();
    const engine = new WorkerNerEngine(worker, { localModelPath: "/models/", minScore: 0.7 });
    const progress: number[] = [];
    const loading = engine.load((p) => progress.push(p));
    expect(worker.sent[0]).toEqual({
      type: "load",
      id: 1,
      options: { localModelPath: "/models/", minScore: 0.7 },
    });
    worker.reply({ type: "progress", id: 1, progress: 0.4 });
    worker.reply({ type: "progress", id: 1, progress: 0.9 });
    worker.reply({ type: "loaded", id: 1 });
    await loading;
    expect(progress).toEqual([0.4, 0.9]);
  });

  it("load : un second appel réutilise le chargement en cours", async () => {
    const worker = new FakeWorker();
    const engine = new WorkerNerEngine(worker);
    const a = engine.load();
    const b = engine.load();
    expect(worker.sent).toHaveLength(1);
    worker.reply({ type: "loaded", id: 1 });
    await Promise.all([a, b]);
  });

  it("load : une erreur est relayée, puis on peut réessayer", async () => {
    const worker = new FakeWorker();
    const engine = new WorkerNerEngine(worker);
    const first = engine.load();
    worker.reply({ type: "error", id: 1, error: { name: "Error", message: "modèle introuvable" } });
    await expect(first).rejects.toThrow("modèle introuvable");
    void engine.load();
    expect(worker.sent).toHaveLength(2);
  });

  it("recognize : envoie le texte, attribue les ids avec ctx.nextId", async () => {
    const worker = new FakeWorker();
    const engine = new WorkerNerEngine(worker);
    const run = engine.recognize(`${SECRET} écrit`, { ...makeCtx(), language: "fr" });
    expect(worker.sent[0]).toEqual({
      type: "recognize",
      id: 1,
      text: `${SECRET} écrit`,
      language: "fr",
    });
    worker.reply({
      type: "result",
      id: 1,
      detections: [wireDetection, { ...wireDetection, start: 20, end: 25 }],
    });
    const detections = await run;
    expect(detections.map((d) => d.id)).toEqual(["id1", "id2"]);
    expect(detections[1]).toMatchObject({ start: 20, end: 25, source: "ner", packId: "ner" });
  });

  it("recognize : distingue les requêtes concurrentes par leur identifiant", async () => {
    const worker = new FakeWorker();
    const engine = new WorkerNerEngine(worker);
    const a = engine.recognize("a", makeCtx());
    const b = engine.recognize("b", makeCtx());
    worker.reply({ type: "result", id: 2, detections: [{ ...wireDetection, start: 2, end: 3 }] });
    worker.reply({ type: "result", id: 1, detections: [] });
    expect(await a).toEqual([]);
    expect((await b)[0]?.start).toBe(2);
  });

  it("recognize : annulation via le signal → message cancel et AbortError", async () => {
    const worker = new FakeWorker();
    const engine = new WorkerNerEngine(worker);
    const controller = new AbortController();
    const run = engine.recognize("texte", makeCtx(controller.signal));
    controller.abort();
    await expect(run).rejects.toBeInstanceOf(AbortError);
    expect(worker.sent[1]).toEqual({ type: "cancel", id: 1 });
    // Une réponse tardive est ignorée sans erreur.
    worker.reply({ type: "result", id: 1, detections: [wireDetection] });
  });

  it("recognize : signal déjà annulé → rien n'est envoyé", async () => {
    const worker = new FakeWorker();
    const engine = new WorkerNerEngine(worker);
    const controller = new AbortController();
    controller.abort();
    await expect(engine.recognize("texte", makeCtx(controller.signal))).rejects.toBeInstanceOf(
      AbortError,
    );
    expect(worker.sent).toEqual([]);
  });

  it("recognize : erreur du worker relayée, AbortError reconstruite", async () => {
    const worker = new FakeWorker();
    const engine = new WorkerNerEngine(worker);
    const a = engine.recognize("a", makeCtx());
    worker.reply({ type: "error", id: 1, error: { name: "AbortError", message: "x" } });
    await expect(a).rejects.toBeInstanceOf(AbortError);
    const b = engine.recognize("b", makeCtx());
    worker.reply({
      type: "error",
      id: 2,
      error: { name: "Error", message: "Échec de l'analyse NER." },
    });
    await expect(b).rejects.toThrow("Échec de l'analyse NER.");
  });

  it("onerror du worker : les requêtes en cours échouent sans détail", async () => {
    const worker = new FakeWorker();
    const engine = new WorkerNerEngine(worker);
    const run = engine.recognize(SECRET, makeCtx());
    worker.onerror?.({ message: `fuite ${SECRET}` });
    const error = await run.catch((e: unknown) => e as Error);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).not.toContain("Camille");
  });

  it("dispose : annule les requêtes en cours, envoie dispose, termine le worker", async () => {
    const worker = new FakeWorker();
    const engine = new WorkerNerEngine(worker);
    const pending = engine.recognize("a", makeCtx());
    const done = engine.dispose();
    await expect(pending).rejects.toBeInstanceOf(AbortError);
    const request = worker.sent.find((m) => m.type === "dispose");
    expect(request).toBeDefined();
    worker.reply({ type: "disposed", id: request!.id });
    await done;
    expect(worker.terminated).toBe(true);
    await expect(engine.recognize("b", makeCtx())).rejects.toThrow(/libéré/);
    await expect(engine.load()).rejects.toThrow(/libéré/);
  });
});

// --- boucle complète client <-> hôte, avec un faux moteur --------------------------------------

/** Relie un client à un hôte de worker par des messages asynchrones, comme `postMessage`. */
function loopback(engine: NerEngine): { client: WorkerNerEngine; log: NerResponse[] } {
  const log: NerResponse[] = [];
  const worker: NerWorkerLike = {
    onmessage: null,
    onerror: null,
    postMessage: (message) => {
      // Copie structurée : ce qui passe est exactement ce qui serait cloné.
      const copy = structuredClone(message);
      setTimeout(() => host.handle(copy), 0);
    },
  };
  const host = createNerWorkerHost({
    createEngine: () => engine,
    post: (message) => {
      log.push(message);
      const copy = structuredClone(message);
      setTimeout(() => worker.onmessage?.({ data: copy }), 0);
    },
  });
  return { client: new WorkerNerEngine(worker), log };
}

class StubEngine implements NerEngine {
  loaded = false;
  disposed = false;
  delay = 0;
  fail: Error | null = null;
  async load(onProgress?: (p: number) => void): Promise<void> {
    onProgress?.(0.5);
    onProgress?.(1);
    this.loaded = true;
  }
  async recognize(text: string, ctx: AnalysisContext): Promise<Detection[]> {
    if (this.fail) throw this.fail;
    // Attente par tranches, en vérifiant le signal comme le vrai moteur.
    for (let i = 0; i < 20 && this.delay > 0; i++) {
      if (ctx.signal?.aborted) throw new AbortError();
      await new Promise((r) => setTimeout(r, this.delay));
    }
    const start = text.indexOf("Camille");
    if (start === -1) return [];
    return [
      {
        id: ctx.nextId(),
        start,
        end: start + 14,
        entityType: "PERSON",
        score: 0.9,
        recognizerId: "ner/stub",
        packId: "ner",
        source: "ner",
        explanation: ["stub"],
      },
    ];
  }
  async dispose(): Promise<void> {
    this.disposed = true;
  }
}

describe("client + hôte du worker (boucle locale)", () => {
  it("charge, analyse, libère", async () => {
    const engine = new StubEngine();
    const { client } = loopback(engine);
    const progress: number[] = [];
    await client.load((p) => progress.push(p));
    expect(engine.loaded).toBe(true);
    expect(progress).toEqual([0.5, 1]);
    const detections = await client.recognize(`Bonjour ${SECRET}.`, makeCtx());
    expect(detections).toHaveLength(1);
    expect(`Bonjour ${SECRET}.`.slice(detections[0]!.start, detections[0]!.end)).toBe(SECRET);
    expect(detections[0]?.id).toBe("id1"); // id attribué côté page
    await client.dispose();
    expect(engine.disposed).toBe(true);
  });

  it("annulation : le signal interrompt l'analyse côté worker", async () => {
    const engine = new StubEngine();
    engine.delay = 5;
    const { client, log } = loopback(engine);
    await client.load();
    const controller = new AbortController();
    const run = client.recognize(SECRET, makeCtx(controller.signal));
    setTimeout(() => controller.abort(), 20);
    await expect(run).rejects.toBeInstanceOf(AbortError);
    await new Promise((r) => setTimeout(r, 60));
    // Le worker a bien reçu cancel et a répondu par une erreur AbortError (ignorée par le client).
    expect(log.some((m) => m.type === "error" && m.error.name === "AbortError")).toBe(true);
  });

  it("une requête annulée avant son tour (file d'attente) n'est pas exécutée", async () => {
    const engine = new StubEngine();
    engine.delay = 5;
    const { client, log } = loopback(engine);
    await client.load();
    const first = client.recognize("a", makeCtx());
    const controller = new AbortController();
    const second = client.recognize(SECRET, makeCtx(controller.signal));
    setTimeout(() => controller.abort(), 10);
    await expect(second).rejects.toBeInstanceOf(AbortError);
    await first;
    await new Promise((r) => setTimeout(r, 30));
    expect(log.filter((m) => m.type === "result")).toHaveLength(1);
  });

  it("une erreur d'analyse est relayée sans le texte ni le message d'origine (R5)", async () => {
    const engine = new StubEngine();
    engine.fail = new TypeError(`échec sur « ${SECRET} »`);
    const { client, log } = loopback(engine);
    await client.load();
    const error = await client.recognize(SECRET, makeCtx()).catch((e: unknown) => e as Error);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).name).toBe("TypeError");
    expect(JSON.stringify(log)).not.toContain("Camille");
  });

  it("recognize avant load : erreur claire", async () => {
    const engine = new StubEngine();
    const { client } = loopback({
      load: () => Promise.resolve(),
      recognize: engine.recognize.bind(engine),
      dispose: () => Promise.resolve(),
    });
    // Aucun load() envoyé : l'hôte n'a pas de moteur.
    await expect(client.recognize("x", makeCtx())).rejects.toThrow(/non chargé/);
  });

  it("une erreur de chargement garde son message (aucun texte en jeu)", async () => {
    const engine = new StubEngine();
    engine.load = () => Promise.reject(new Error("model_quantized.onnx introuvable"));
    const { client } = loopback(engine);
    await expect(client.load()).rejects.toThrow("model_quantized.onnx introuvable");
  });
});
