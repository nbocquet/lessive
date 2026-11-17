import { describe, expect, it } from "vitest";
import { createAnalysisHandler } from "./analysis-engine.ts";
import type { AnalyzeRequest, WorkerResponse } from "./analysis-protocol.ts";
import { loadBundledRegistry } from "./packs.ts";

const TEXT = "Écrire à jeanne.test@example.org avant demain.";

function setup(loadNer = async () => undefined as undefined) {
  const out: WorkerResponse[] = [];
  const handler = createAnalysisHandler(loadBundledRegistry, (r) => out.push(r), loadNer);
  const ids = loadBundledRegistry()
    .activeRules()
    .map((r) => r.globalId);
  const request = (over: Partial<AnalyzeRequest> = {}): AnalyzeRequest => ({
    type: "analyze",
    id: 1,
    text: TEXT,
    minScore: 0.5,
    manual: [],
    activeRuleIds: ids,
    ner: false,
    ...over,
  });
  const final = async (id: number) => {
    await expect.poll(() => out.find((r) => r.id === id && r.type !== "progress")).toBeDefined();
    return out.find((r) => r.id === id && r.type !== "progress") as WorkerResponse;
  };
  return { handler, out, request, final, ids };
}

describe("analysis-engine", () => {
  it("analyse un texte et renvoie les détections", async () => {
    const { handler, request, final, out } = setup();
    handler.handle(request());
    const res = await final(1);
    expect(res.type).toBe("result");
    if (res.type !== "result") return;
    expect(res.result.detections.some((d) => d.entityType === "EMAIL")).toBe(true);
    expect(out[0]).toMatchObject({ type: "progress", stage: "rules" });
  });

  it("propage les formes connues (knownPersons) vers l'analyse", async () => {
    const { handler, request, final } = setup();
    const text = "Merci à Sophie et à CMARTIN.";
    handler.handle(request({ id: 5, text, knownPersons: ["Sophie Durand", "CMARTIN"] }));
    const res = await final(5);
    expect(res.type).toBe("result");
    if (res.type !== "result") return;
    const values = res.result.detections.map((d) => text.slice(d.start, d.end));
    expect(values).toEqual(["Sophie", "CMARTIN"]);
    expect(JSON.stringify(res)).not.toContain("Durand");
  });

  it("n'applique que les règles actives demandées", async () => {
    const { handler, request, final } = setup();
    handler.handle(request({ activeRuleIds: [] }));
    const res = await final(1);
    expect(res.type === "result" && res.result.detections).toEqual([]);
  });

  it("refuse une règle inconnue", async () => {
    const { handler, request, final } = setup();
    handler.handle(request({ activeRuleIds: ["global/inexistante"] }));
    expect(await final(1)).toMatchObject({ type: "error", code: "invalid_request" });
  });

  it("renvoie une erreur sans valeur du texte pour une détection manuelle invalide", async () => {
    const { handler, request, final } = setup();
    const manual = [
      {
        id: "x",
        start: 5,
        end: 9999,
        entityType: "PERSON" as const,
        score: 1,
        recognizerId: "manual",
        packId: "manual",
        source: "manual" as const,
        explanation: [],
      },
    ];
    handler.handle(request({ manual }));
    const res = await final(1);
    expect(res).toMatchObject({ type: "error", code: "invalid_input" });
    expect(JSON.stringify(res)).not.toContain("jeanne");
  });

  it("n'expose pas le message d'une erreur inattendue", async () => {
    const out: WorkerResponse[] = [];
    const handler = createAnalysisHandler(
      () => {
        throw new Error("secret jeanne.test@example.org");
      },
      (r) => out.push(r),
      async () => undefined,
    );
    handler.handle({
      type: "analyze",
      id: 7,
      text: TEXT,
      minScore: 0.5,
      manual: [],
      activeRuleIds: [],
      ner: false,
    });
    await expect.poll(() => out.length).toBeGreaterThan(1);
    const err = out.find((r) => r.type === "error");
    expect(err).toMatchObject({ code: "internal" });
    expect(JSON.stringify(out)).not.toContain("secret");
  });

  it("signale que le NER est indisponible quand il est demandé sans moteur", async () => {
    const { handler, request, final } = setup();
    handler.handle(request({ ner: true }));
    const res = await final(1);
    expect(res.type === "result" && res.result.warnings.join(" ")).toContain("NER");
  });

  it("annule une analyse sur demande", async () => {
    const { handler, request, final } = setup();
    handler.handle(request());
    handler.handle({ type: "cancel", id: 1 });
    expect((await final(1)).type).toBe("cancelled");
  });
});
