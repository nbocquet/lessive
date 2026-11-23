import { afterEach, describe, expect, it, vi } from "vitest";
import type { AnalysisResult, Detection } from "../core/index.ts";
import {
  AnalysisCancelledError,
  AnalysisFailure,
  type AnalysisJob,
  type AnalysisService,
  type AnalyzeParams,
  type NerStatusListener,
  type ProgressListener,
} from "./analysis-client.ts";
import { AppState } from "./state.svelte.ts";

const TEXT = "Contact : jean.test@example.org et marie.test@example.org.";

function det(id: string, start: number, end: number, extra: Partial<Detection> = {}): Detection {
  return {
    id,
    start,
    end,
    entityType: "EMAIL",
    score: 0.9,
    recognizerId: "global/email",
    packId: "global",
    source: "pattern",
    explanation: [],
    ...extra,
  };
}

const RESULT: AnalysisResult = {
  detections: [det("d1", 10, 31), det("d2", 35, 57)],
  discarded: [],
  warnings: ["NER non actif"],
};

interface Call {
  params: AnalyzeParams;
  onProgress: ProgressListener | undefined;
  onNerStatus: NerStatusListener | undefined;
  resolve(r: AnalysisResult): void;
  reject(e: Error): void;
  cancelled: boolean;
}

/** Faux service : chaque appel reste en attente jusqu'à `resolve`/`reject`. */
function fakeService() {
  const calls: Call[] = [];
  const service: AnalysisService = {
    start(params, onProgress, onNerStatus) {
      let resolve!: (r: AnalysisResult) => void;
      let reject!: (e: Error) => void;
      const result = new Promise<AnalysisResult>((res, rej) => {
        resolve = res;
        reject = rej;
      });
      const call: Call = { params, onProgress, onNerStatus, resolve, reject, cancelled: false };
      calls.push(call);
      const job: AnalysisJob = {
        result,
        cancel() {
          call.cancelled = true;
          reject(new AnalysisCancelledError());
        },
      };
      return job;
    },
    dispose() {},
  };
  return { service, calls };
}

async function analyzed(result: AnalysisResult = RESULT) {
  const { service, calls } = fakeService();
  const app = new AppState({ service });
  app.setText(TEXT);
  const p = app.analyze();
  calls[0]!.resolve(result);
  await p;
  return { app, calls };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

describe("AppState : état initial", () => {
  it("démarre vide, en masquage, langue auto, seuil 0,5", () => {
    const app = new AppState({ service: fakeService().service });
    expect(app).toMatchObject({
      text: "",
      mode: "masking",
      language: "auto",
      minScore: 0.5,
      analysisStatus: "idle",
      validated: false,
      session: null,
      transformed: null,
    });
    expect(app.canAnalyze).toBe(false);
    expect(app.activeRuleIds.length).toBeGreaterThan(0);
  });
});

describe("AppState : analyse", () => {
  it("passe par running puis done, avec détections et avertissements", async () => {
    const { service, calls } = fakeService();
    const app = new AppState({ service });
    app.setText(TEXT);
    app.setLanguage("fr");
    const p = app.analyze();
    expect(app.analysisStatus).toBe("running");
    expect(calls[0]!.params).toMatchObject({
      text: TEXT,
      language: "fr",
      minScore: 0.5,
      ner: false,
    });
    calls[0]!.onProgress?.("rules", 0.4);
    expect(app.progress).toBe(0.4);
    calls[0]!.resolve(RESULT);
    await p;
    expect(app.analysisStatus).toBe("done");
    expect(app.detectionCount).toBe(2);
    expect(app.warnings).toEqual(["NER non actif"]);
    expect(app.progress).toBeNull();
  });

  it("n'envoie pas de langue en mode auto", async () => {
    const { service, calls } = fakeService();
    const app = new AppState({ service });
    app.setText(TEXT);
    void app.analyze();
    expect("language" in calls[0]!.params).toBe(false);
  });

  it("annule une analyse en cours", async () => {
    const { service, calls } = fakeService();
    const app = new AppState({ service });
    app.setText(TEXT);
    const p = app.analyze();
    app.cancelAnalysis();
    await p;
    expect(calls[0]!.cancelled).toBe(true);
    expect(app.analysisStatus).toBe("idle");
    expect(app.analysis).toBeNull();
  });

  it("signale une erreur sans reprendre le texte", async () => {
    const { service, calls } = fakeService();
    const app = new AppState({ service });
    app.setText(TEXT);
    const p = app.analyze();
    calls[0]!.reject(new AnalysisFailure("internal", "Erreur interne pendant l'analyse."));
    await p;
    expect(app.analysisStatus).toBe("error");
    expect(app.errorMessage).toBe("Erreur interne pendant l'analyse.");
    const p2 = app.analyze();
    calls[1]!.reject(new Error(`boom ${TEXT}`));
    await p2;
    expect(app.errorMessage).not.toContain("jean");
  });

  it("refuse un texte trop long sans appeler le worker", async () => {
    const { service, calls } = fakeService();
    const app = new AppState({ service });
    app.setText("a".repeat(200_001));
    await app.analyze();
    expect(calls).toHaveLength(0);
    expect(app.analysisStatus).toBe("error");
  });

  it("ignore le résultat d'une analyse dépassée par une nouvelle", async () => {
    const { service, calls } = fakeService();
    const app = new AppState({ service });
    app.setText(TEXT);
    const first = app.analyze();
    const second = app.analyze();
    calls[1]!.resolve({ detections: [det("d9", 0, 3)], discarded: [], warnings: [] });
    await Promise.all([first, second]);
    expect(app.analysis?.detections.map((d) => d.id)).toEqual(["d9"]);
  });

  it("marque l'analyse obsolète quand un réglage change, et la relance la rafraîchit", async () => {
    const { app, calls } = await analyzed();
    app.setMinScore(0.8);
    expect(app.analysisStale).toBe(true);
    expect(app.canCopy).toBe(false);
    const p = app.analyze();
    calls[1]!.resolve(RESULT);
    await p;
    expect(calls[1]!.params.minScore).toBe(0.8);
    expect(app.analysisStale).toBe(false);
  });

  it("transmet les règles actives et reflète packs et règles désactivés", () => {
    const { service } = fakeService();
    const app = new AppState({ service });
    const all = app.activeRuleIds.length;
    const first = app.registry.list()[0]!;
    app.setPackEnabled(first.manifest.id, false);
    expect(app.activeRuleIds.length).toBeLessThan(all);
    expect(app.isPackEnabled(first.manifest.id)).toBe(false);
    app.resetRules();
    expect(app.activeRuleIds.length).toBe(all);
    const gid = app.activeRuleIds[0]!;
    app.setRuleEnabled(gid, false);
    expect(app.activeRuleIds).not.toContain(gid);
    expect(() => app.setRuleEnabled("x/y", true)).toThrow(RangeError);
    expect(() => app.setPackEnabled("absent", true)).toThrow(RangeError);
  });
});

describe("AppState : corrections", () => {
  it("supprime et restaure une détection, change type et opérateur", async () => {
    const { app } = await analyzed();
    app.removeDetection("d1");
    expect(app.detections.map((d) => d.id)).toEqual(["d2"]);
    app.restoreDetection("d1");
    expect(app.detectionCount).toBe(2);
    app.setDetectionType("d2", "URL");
    expect(app.detections.find((d) => d.id === "d2")?.entityType).toBe("URL");
    app.setDetectionType("d2", null);
    expect(app.detections.find((d) => d.id === "d2")?.entityType).toBe("EMAIL");
    app.setDetectionOperator("d1", "categorize");
    expect(app.plan.byDetectionId).toEqual({ d1: "categorize" });
    app.setDetectionOperator("d1", null);
    expect(app.plan.byDetectionId).toEqual({});
  });

  it("refuse « pseudonymize » en masquage et le retire au passage en masquage", async () => {
    const { app } = await analyzed();
    expect(() => app.setDetectionOperator("d1", "pseudonymize")).toThrow();
    app.setMode("pseudonymization");
    app.setDetectionOperator("d1", "pseudonymize");
    app.setOperatorForType("EMAIL", "pseudonymize");
    app.setMode("masking");
    expect(app.plan.byDetectionId).toEqual({});
    expect(app.plan.byEntityType).toEqual({});
    expect(app.plan.defaultOperator).toBe("mask");
  });

  it("un ajout manuel relance l'analyse avec la détection manuelle", async () => {
    const { app, calls } = await analyzed();
    app.addManual({ start: 0, end: 7, entityType: "PERSON" });
    expect(app.analysisStatus).toBe("running");
    expect(calls[1]!.params.manual).toMatchObject([
      { id: "m1", start: 0, end: 7, entityType: "PERSON" },
    ]);
    calls[1]!.resolve({
      detections: [
        det("m1", 0, 7, { source: "manual", entityType: "PERSON" }),
        ...RESULT.detections,
      ],
      discarded: [],
      warnings: [],
    });
    await tick();
    expect(app.detectionCount).toBe(3);
    // Les corrections par identifiant du moteur survivent à la relance déclenchée par un ajout.
    expect(app.analysisStale).toBe(false);
  });

  it("valide les intervalles manuels sans citer le texte", async () => {
    const { app } = await analyzed();
    for (const bad of [
      { start: -1, end: 3 },
      { start: 5, end: 5 },
      { start: 0, end: TEXT.length + 1 },
      { start: 1.5, end: 4 },
    ]) {
      expect(() => app.addManual({ ...bad, entityType: "PERSON" })).toThrow(RangeError);
    }
  });

  it("supprimer un ajout manuel décale les corrections des suivants", async () => {
    const { app, calls } = await analyzed();
    app.addManualMany([
      { start: 0, end: 3, entityType: "PERSON" },
      { start: 4, end: 7, entityType: "PERSON" },
    ]);
    const manual = [det("m1", 0, 3, { source: "manual" }), det("m2", 4, 7, { source: "manual" })];
    calls[1]!.resolve({ detections: manual, discarded: [], warnings: [] });
    await tick();
    app.setDetectionType("m2", "LOCATION");
    app.removeDetection("m1");
    expect(calls[2]!.params.manual).toMatchObject([{ id: "m1", start: 4, end: 7 }]);
    expect(app.corrections.typeOverrides).toEqual({ m1: "LOCATION" });
    expect(app.corrections.added).toEqual([{ start: 4, end: 7, entityType: "PERSON" }]);
  });
});

describe("AppState : transformation et validation", () => {
  it("masque, puis valide uniquement un résultat calculé", async () => {
    const { app } = await analyzed();
    expect(app.validate()).toBe(false);
    const res = app.refreshTransform();
    expect(res?.applied).toHaveLength(2);
    expect(res?.text).not.toContain("example.org");
    expect(res?.text.startsWith("Contact : ")).toBe(true);
    expect(app.validate()).toBe(true);
    expect(app.validated).toBe(true);
    expect(app.canCopy).toBe(true);
    expect(app.session).toBeNull();
  });

  it("pseudonymise avec une session créée en mémoire", async () => {
    const { app } = await analyzed({
      detections: [det("d1", 10, 31, { entityType: "PERSON" })],
      discarded: [],
      warnings: [],
    });
    app.setMode("pseudonymization");
    const res = app.refreshTransform();
    expect(res?.text).toContain("PERSONNE_001");
    expect(app.session?.entities()).toHaveLength(1);
    const before = app.session;
    app.newSession();
    expect(app.session).not.toBe(before);
    expect(app.session?.entities()).toHaveLength(0);
  });

  it("passe à l'analyse les formes des personnes de la session (knownPersons)", async () => {
    const { app, calls } = await analyzed({
      detections: [det("d1", 10, 31, { entityType: "PERSON" })],
      discarded: [],
      warnings: [],
    });
    expect(calls[0]!.params.knownPersons).toBeUndefined();
    app.setMode("pseudonymization");
    app.refreshTransform();
    const forms = app.session!.entities().flatMap((e) => e.surfaceForms);
    expect(forms.length).toBeGreaterThan(0);
    const p = app.analyze();
    expect(calls[1]!.params.knownPersons).toEqual(forms);
    calls[1]!.resolve({ detections: [], discarded: [], warnings: [] });
    await p;
  });

  it("renseigne transformError sans valeur du texte quand le plan est invalide", async () => {
    const { app } = await analyzed();
    // Détections qui se chevauchent : le transformateur refuse.
    app.analysis = {
      detections: [det("d1", 0, 10), det("d2", 5, 15)],
      discarded: [],
      warnings: [],
    };
    expect(app.refreshTransform()).toBeNull();
    expect(app.transformError).toBeTruthy();
    expect(app.transformError).not.toContain("Contact");
  });

  it("remet la validation à faux à toute modification", async () => {
    const modifications: [string, (a: AppState) => void][] = [
      ["setText", (a) => a.setText("Autre texte")],
      ["setMode", (a) => a.setMode("pseudonymization")],
      ["setLanguage", (a) => a.setLanguage("en")],
      ["setMinScore", (a) => a.setMinScore(0.9)],
      ["setNer", (a) => a.setNer(true)],
      ["setPackEnabled", (a) => a.setPackEnabled(a.registry.list()[0]!.manifest.id, false)],
      ["setRuleEnabled", (a) => a.setRuleEnabled(a.activeRuleIds[0]!, false)],
      ["resetRules", (a) => a.resetRules()],
      ["removeDetection", (a) => a.removeDetection("d1")],
      [
        "restoreDetection",
        (a) => {
          a.removeDetection("d1");
          a.validate();
          a.restoreDetection("d1");
        },
      ],
      ["setDetectionType", (a) => a.setDetectionType("d1", "URL")],
      ["setDetectionOperator", (a) => a.setDetectionOperator("d1", "suppress")],
      ["setOperatorForType", (a) => a.setOperatorForType("EMAIL", "categorize")],
      ["newSession", (a) => a.newSession()],
      ["reset", (a) => a.reset()],
    ];
    for (const [name, modify] of modifications) {
      const { app } = await analyzed();
      app.refreshTransform();
      expect(app.validate(), name).toBe(true);
      modify(app);
      expect(app.validated, name).toBe(false);
      expect(app.transformed, name).toBeNull();
    }
  });

  it("une nouvelle analyse remet la validation à faux", async () => {
    const { app, calls } = await analyzed();
    app.refreshTransform();
    app.validate();
    const p = app.analyze();
    calls[1]!.resolve(RESULT);
    await p;
    expect(app.validated).toBe(false);
  });

  it("ne remet pas la validation à faux pour la sélection et la réponse du LLM", async () => {
    const { app } = await analyzed();
    app.refreshTransform();
    app.validate();
    app.selectDetection("d1");
    app.setTextSelection({ start: 0, end: 3 });
    app.setLlmResponse("réponse");
    expect(app.validated).toBe(true);
    app.unvalidate();
    expect(app.validated).toBe(false);
  });
});

describe("AppState : texte, réponse du LLM, remise à zéro", () => {
  it("setText repart de zéro mais garde réglages, session et réponse du LLM", async () => {
    const { app } = await analyzed();
    app.setMode("pseudonymization");
    app.refreshTransform();
    app.setLlmResponse("réponse");
    app.setLanguage("en");
    app.setText("Nouveau");
    expect(app).toMatchObject({
      analysis: null,
      analysisStatus: "idle",
      mode: "pseudonymization",
      language: "en",
      llmResponse: "réponse",
    });
    expect(app.session).not.toBeNull();
    expect(app.detections).toEqual([]);
  });

  it("la réidentification suit la réponse et la session, en direct", async () => {
    const { app } = await analyzed();
    expect(app.reidentification).toBeNull();
    app.setLlmResponse("Écrire à EMAIL_001.");
    // Masquage : aucune session, rien à réidentifier.
    expect(app.reidentification).toBeNull();
    app.setMode("pseudonymization");
    const out = app.refreshTransform();
    expect(out?.text).toContain("EMAIL_001");
    expect(app.reidentification?.text).toBe("Écrire à jean.test@example.org.");
    app.setLlmResponse("Écrire à EMAIL_001 et EMAIL_009.");
    expect(app.reidentification?.unknown.map((t) => t.pseudonym)).toEqual(["EMAIL_009"]);
    app.newSession();
    expect(app.reidentification).toBeNull();
  });

  it("hasCorrections signale toute correction, discardCorrections les abandonne et relance", async () => {
    const { app, calls } = await analyzed();
    expect(app.hasCorrections).toBe(false);
    app.removeDetection("d1");
    expect(app.hasCorrections).toBe(true);
    app.discardCorrections();
    expect(app.hasCorrections).toBe(false);
    expect(app.corrections.removedIds).toEqual([]);
    expect(calls).toHaveLength(2);
    expect(app.analysisStatus).toBe("running");
  });

  it("reset efface texte, analyse, corrections et réponse, et annule l'analyse", async () => {
    const { service, calls } = fakeService();
    const app = new AppState({ service });
    app.setText(TEXT);
    void app.analyze();
    app.reset();
    expect(calls[0]!.cancelled).toBe(true);
    expect(app).toMatchObject({
      text: "",
      analysisStatus: "idle",
      llmResponse: "",
    });
  });

  it("borne le seuil entre 0 et 1", () => {
    const app = new AppState({ service: fakeService().service });
    app.setMinScore(3);
    expect(app.minScore).toBe(1);
    app.setMinScore(-2);
    expect(app.minScore).toBe(0);
    app.setMinScore(Number.NaN);
    expect(app.minScore).toBe(0.5);
  });
});

describe("AppState : modèle local (ADR 0003)", () => {
  const CONFIG = JSON.stringify({ id2label: { 0: "O", 1: "B-PER", 2: "B-LOC" } });
  const file = (name: string, path: string, content: BlobPart) =>
    Object.assign(new Blob([content]), { name, webkitRelativePath: path });
  const goodFiles = () => [
    file("config.json", "m/config.json", CONFIG),
    file("tokenizer.json", "m/tokenizer.json", "{}"),
    file("tokenizer_config.json", "m/tokenizer_config.json", "{}"),
    file("model_quantized.onnx", "m/onnx/model_quantized.onnx", new Uint8Array(2048)),
  ];

  function withModelService() {
    const models: unknown[] = [];
    const base = fakeService();
    const service: AnalysisService = {
      start: (...args) => base.service.start(...args),
      dispose: () => base.service.dispose(),
      setModel: (m) => void models.push(m),
    };
    return { app: new AppState({ service }), models, calls: base.calls };
  }

  it("démarre sans modèle", () => {
    const { app } = withModelService();
    expect(app.modelStatus).toBe("absent");
    expect(app.modelInfo).toBeNull();
  });

  it("refuse une sélection invalide sans toucher à l'état", async () => {
    const { app, models } = withModelService();
    expect(await app.loadModelFromFiles([file("config.json", "m/config.json", "{}")])).toBe(false);
    expect(app.modelError).toContain("manquant");
    expect(app.modelStatus).toBe("absent");
    expect(models).toEqual([]);
  });

  it("garde le modèle en mémoire sans Cache Storage, l'explique, puis l'oublie", async () => {
    const { app, models } = withModelService();
    expect(await app.loadModelFromFiles(goodFiles())).toBe(true);
    expect(app.modelStatus).toBe("stored");
    expect(app.modelInfo).toMatchObject({ origin: "memory", labels: ["PER", "LOC"] });
    expect(app.modelNotice).toContain("cette session seulement");
    expect(models[0]).toMatchObject({ kind: "memory", dtype: "q8" });

    await app.forgetModel();
    expect(app.modelStatus).toBe("absent");
    expect(app.modelInfo).toBeNull();
    expect(models.at(-1)).toEqual({ kind: "cache" });
  });

  it("suit l'issue du chargement du NER rapportée par le worker", async () => {
    const { app, calls } = withModelService();
    await app.loadModelFromFiles(goodFiles());
    app.setText(TEXT);
    app.setNer(true);
    const run = app.analyze();
    calls[0]?.onProgress?.("ner", 0.5);
    expect(app.modelStatus).toBe("loading");
    calls[0]?.onNerStatus?.("ready");
    calls[0]?.resolve(RESULT);
    await run;
    expect(app.modelStatus).toBe("ready");
  });

  describe("modèle fourni (ADR 0004)", () => {
    afterEach(() => vi.unstubAllGlobals());

    const bundled = {
      "config.json": CONFIG,
      "tokenizer.json": "{}",
      "tokenizer_config.json": "{}",
      "onnx/model_quantized.onnx": new Uint8Array(2048),
    };
    const manifest = {
      name: "Xenova/exemple-ner",
      license: "MIT",
      attribution: "Modèle d'exemple.",
      licenseFile: "LICENSE.txt",
      files: Object.entries(bundled).map(([name, v]) => ({
        name,
        size: typeof v === "string" ? v.length : v.length,
      })),
    };

    it("ne fait rien sans modèle fourni", async () => {
      const { app, models } = withModelService();
      expect(await app.installBundledModel()).toBe(false);
      expect(models).toEqual([]);
    });

    it("installe le modèle fourni, active la reconnaissance des noms et remet la progression à zéro", async () => {
      const urls: string[] = [];
      vi.stubGlobal(
        "fetch",
        vi.fn((u: URL) => {
          urls.push(String(u));
          const name = String(u).split("/models/bundled/")[1] ?? "";
          return Promise.resolve(new Response(bundled[name as keyof typeof bundled]));
        }),
      );
      const { app, models } = withModelService();
      app.bundledModel = manifest;
      expect(await app.installBundledModel()).toBe(true);
      expect(app.modelInfo).toMatchObject({ name: "Xenova/exemple-ner", origin: "memory" });
      expect(app.modelStatus).toBe("stored");
      expect(app.ner).toBe(true);
      expect(app.bundledProgress).toBeNull();
      expect(app.modelBusy).toBe(false);
      expect(models[0]).toMatchObject({ kind: "memory", name: "Xenova/exemple-ner" });
      expect(urls).toHaveLength(4);
    });

    it("rapporte un échec sans toucher au modèle", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(() => Promise.resolve(new Response("", { status: 404 }))),
      );
      const { app, models } = withModelService();
      app.bundledModel = manifest;
      expect(await app.installBundledModel()).toBe(false);
      expect(app.modelError).toContain("introuvable");
      expect(app.modelStatus).toBe("absent");
      expect(models).toEqual([]);
    });
  });
});

describe("AppState : analyse automatique (#38)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  function auto() {
    vi.useFakeTimers();
    const { service, calls } = fakeService();
    const app = new AppState({ service, autoAnalysisDelayMs: 800 });
    return { app, calls };
  }

  it("analyse tout de suite au collage", () => {
    const { app, calls } = auto();
    app.setText(TEXT, { immediate: true });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.params.text).toBe(TEXT);
    expect(app.analysisStatus).toBe("running");
  });

  it("attend la fin de la saisie : une seule analyse après plusieurs frappes", () => {
    const { app, calls } = auto();
    app.setText("Contact");
    vi.advanceTimersByTime(500);
    app.setText("Contact :");
    vi.advanceTimersByTime(500);
    expect(calls).toHaveLength(0);
    expect(app.analysisScheduled).toBe(true);
    vi.advanceTimersByTime(300);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.params.text).toBe("Contact :");
    expect(app.analysisScheduled).toBe(false);
  });

  it("une frappe annule l'analyse en cours", () => {
    const { app, calls } = auto();
    app.setText(TEXT, { immediate: true });
    app.setText(TEXT + " Suite");
    expect(calls[0]!.cancelled).toBe(true);
    vi.advanceTimersByTime(800);
    expect(calls).toHaveLength(2);
  });

  it("ne lance rien pour un texte vide et annule l'attente", () => {
    const { app, calls } = auto();
    app.setText("Contact");
    app.setText("   ");
    vi.advanceTimersByTime(2000);
    expect(calls).toHaveLength(0);
  });

  it("relance après un réglage en gardant les corrections", async () => {
    const { app, calls } = auto();
    app.setText(TEXT, { immediate: true });
    calls[0]!.resolve(RESULT);
    await Promise.resolve();
    await Promise.resolve();
    expect(app.analysisStatus).toBe("done");
    app.removeDetection("d1");
    app.setLanguage("fr");
    expect(app.analysisStale).toBe(true);
    vi.advanceTimersByTime(800);
    expect(calls).toHaveLength(2);
    calls[1]!.resolve(RESULT);
    await Promise.resolve();
    await Promise.resolve();
    expect(app.analysisStale).toBe(false);
    expect(app.corrections.removedIds).toEqual(["d1"]);
  });

  it("sans délai configuré, rien n'est lancé automatiquement", () => {
    vi.useFakeTimers();
    const { service, calls } = fakeService();
    const app = new AppState({ service });
    app.setText(TEXT, { immediate: true });
    vi.advanceTimersByTime(2000);
    expect(calls).toHaveLength(0);
  });
});
