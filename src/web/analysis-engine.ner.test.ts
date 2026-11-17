import { describe, expect, it } from "vitest";
import { loadBundledRegistry } from "./packs.ts";
import { createAnalysisHandler } from "./analysis-engine.ts";
import type { WorkerResponse } from "./analysis-protocol.ts";

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
