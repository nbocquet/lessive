import { describe, expect, it } from "vitest";
import { LocalModelMissingError } from "../ner/local-files.ts";
import { loadBundledRegistry } from "./packs.ts";
import { createAnalysisHandler } from "./analysis-engine.ts";
import type { WorkerRequest, WorkerResponse } from "./analysis-protocol.ts";

describe("worker d'analyse : échec du chargement du NER", () => {
  it("relaie l'échec comme avertissement, sans erreur ni valeur du texte, et réessaie ensuite", async () => {
    const out: WorkerResponse[] = [];
    let calls = 0;
    const handler = createAnalysisHandler(
      loadBundledRegistry,
      (r) => out.push(r),
      () => {
        calls++;
        return Promise.reject(new Error("config.json introuvable"));
      },
    );
    const send = async (id: number) => {
      handler.handle({
        type: "analyze",
        id,
        text: "secret",
        minScore: 0.5,
        manual: [],
        activeRuleIds: [],
        ner: true,
      });
      await expect.poll(() => out.find((r) => r.id === id && r.type !== "progress")).toBeDefined();
      return out.find((r) => r.id === id && r.type !== "progress");
    };
    const res = await send(1);
    expect(res?.type).toBe("result");
    expect(res?.type === "result" && res.result.warnings.join(" ")).toContain("modèle introuvable");
    expect(JSON.stringify(out)).not.toContain("secret");
    await send(2);
    expect(calls).toBe(2);
  });
});

describe("worker d'analyse : modèle chargé par l'utilisateur", () => {
  const request = (id: number): WorkerRequest => ({
    type: "analyze",
    id,
    text: "secret",
    minScore: 0.5,
    manual: [],
    activeRuleIds: [],
    ner: true,
  });

  it("avertit « chargez d'abord le modèle » et signale l'état `missing`", async () => {
    const out: WorkerResponse[] = [];
    const handler = createAnalysisHandler(
      loadBundledRegistry,
      (r) => out.push(r),
      () => Promise.reject(new LocalModelMissingError()),
    );
    handler.handle(request(1));
    await expect.poll(() => out.find((r) => r.type === "result")).toBeDefined();
    const result = out.find((r) => r.type === "result");
    expect(result?.type === "result" && result.result.warnings.join(" ")).toContain(
      "chargez d'abord le modèle",
    );
    expect(result).toMatchObject({ nerStatus: "missing" });
  });

  it("transmet la source du modèle au fournisseur et abandonne le moteur à chaque changement", async () => {
    const out: WorkerResponse[] = [];
    const seen: unknown[] = [];
    let disposed = 0;
    const handler = createAnalysisHandler(
      loadBundledRegistry,
      (r) => out.push(r),
      (_progress, model) => {
        seen.push(model);
        return Promise.resolve({
          load: () => Promise.resolve(),
          recognize: () => Promise.resolve([]),
          dispose: () => {
            disposed++;
            return Promise.resolve();
          },
        });
      },
    );
    const done = async (id: number) =>
      expect.poll(() => out.find((r) => r.id === id && r.type === "result")).toBeDefined();
    handler.handle(request(1));
    await done(1);
    handler.handle(request(2));
    await done(2);
    expect(seen).toEqual([undefined]); // moteur gardé entre deux analyses
    expect(out.filter((r) => r.type === "result" && r.nerStatus === "ready")).toHaveLength(2);

    handler.handle({ type: "set-model", model: { kind: "dev" } });
    expect(disposed).toBe(1);
    handler.handle(request(3));
    await done(3);
    expect(seen).toEqual([undefined, { kind: "dev" }]);
  });
});
