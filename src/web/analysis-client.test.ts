import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AnalysisCancelledError,
  AnalysisClient,
  AnalysisFailure,
  CANCEL_GRACE_MS,
  type AnalyzeParams,
  type WorkerLike,
} from "./analysis-client.ts";
import { createAnalysisHandler } from "./analysis-engine.ts";
import type { WorkerRequest, WorkerResponse } from "./analysis-protocol.ts";
import { loadBundledRegistry } from "./packs.ts";

const params = (text = "Mail : claire.synthetique@example.org"): AnalyzeParams => ({
  text,
  minScore: 0.5,
  manual: [],
  activeRuleIds: loadBundledRegistry()
    .activeRules()
    .map((r) => r.globalId),
  ner: false,
});

/** Worker de test relié au vrai moteur, avec livraison asynchrone comme un vrai worker. */
function loopbackWorker(): WorkerLike & { sent: WorkerRequest[] } {
  const sent: WorkerRequest[] = [];
  const worker: WorkerLike & { sent: WorkerRequest[] } = {
    sent,
    onmessage: null,
    onerror: null,
    terminate: vi.fn(),
    postMessage(message) {
      sent.push(message);
      queueMicrotask(() => handler.handle(message));
    },
  };
  const handler = createAnalysisHandler(
    loadBundledRegistry,
    (response: WorkerResponse) => setTimeout(() => worker.onmessage?.({ data: response }), 0),
    async () => undefined,
  );
  return worker;
}

/** Worker muet : ne répond jamais (calcul bloqué). */
function silentWorker(): WorkerLike & { sent: WorkerRequest[] } {
  const sent: WorkerRequest[] = [];
  return {
    sent,
    onmessage: null,
    onerror: null,
    terminate: vi.fn(),
    postMessage: (m) => void sent.push(m),
  };
}

afterEach(() => vi.useRealTimers());

describe("AnalysisClient", () => {
  it("n'instancie le worker qu'au premier appel", () => {
    const factory = vi.fn(loopbackWorker);
    const client = new AnalysisClient(factory);
    expect(factory).not.toHaveBeenCalled();
    void client.start(params()).result.catch(() => undefined);
    expect(factory).toHaveBeenCalledOnce();
    client.dispose();
  });

  it("renvoie le résultat et la progression", async () => {
    const client = new AnalysisClient(loopbackWorker);
    const progress: number[] = [];
    const res = await client.start(params(), (_stage, p) => progress.push(p)).result;
    expect(res.detections.some((d) => d.entityType === "EMAIL")).toBe(true);
    expect(progress[0]).toBe(0);
    client.dispose();
  });

  it("transmet une erreur du worker sous forme d'AnalysisFailure", async () => {
    const client = new AnalysisClient(loopbackWorker);
    await expect(
      client.start({ ...params(), activeRuleIds: ["x/y"] }).result,
    ).rejects.toMatchObject({
      name: "AnalysisFailure",
      code: "invalid_request",
    });
    client.dispose();
  });

  it("annule : promesse rejetée, message cancel envoyé", async () => {
    const worker = silentWorker();
    const client = new AnalysisClient(() => worker);
    const job = client.start(params());
    job.cancel();
    await expect(job.result).rejects.toBeInstanceOf(AnalysisCancelledError);
    expect(worker.sent.map((m) => m.type)).toEqual(["analyze", "cancel"]);
    client.dispose();
  });

  it("force l'arrêt d'un worker qui ne répond pas à l'annulation, puis en recrée un", async () => {
    vi.useFakeTimers();
    const workers: ReturnType<typeof silentWorker>[] = [];
    const client = new AnalysisClient(() => {
      const w = silentWorker();
      workers.push(w);
      return w;
    });
    const job = client.start(params());
    job.result.catch(() => undefined);
    job.cancel();
    vi.advanceTimersByTime(CANCEL_GRACE_MS + 10);
    expect(workers[0]?.terminate).toHaveBeenCalledOnce();
    client.start(params()).result.catch(() => undefined);
    expect(workers).toHaveLength(2);
    client.dispose();
  });

  it("rejette les analyses en cours si le worker plante, sans détail", async () => {
    const worker = silentWorker();
    const client = new AnalysisClient(() => worker);
    const job = client.start(params());
    worker.onerror?.({ message: "contenu sensible" });
    const err = await job.result.catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AnalysisFailure);
    expect((err as AnalysisFailure).message).not.toContain("sensible");
  });
});
