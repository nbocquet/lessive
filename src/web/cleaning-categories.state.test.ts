/** Sélection par catégorie, moteur réel et état Svelte (#26), données fictives. */
import { describe, expect, it } from "vitest";
import { createAnalyzer, reidentify, type NerEngine } from "../core/index.ts";
import { AppState } from "./state.svelte.ts";
import { ALL_CLEANING_CATEGORIES } from "./cleaning-categories.ts";
import type { AnalysisService } from "./analysis-client.ts";

const TEXT =
  "Claire Martin, née le 12 mars 1985. Adresse : 18 rue des Mélèzes, 1205 Genève. Visite à Lausanne. Courriel probe@example.org. Téléphone +41 79 234 56 78. IP 192.0.2.1. Compte CMARTIN.";
const ner: NerEngine = {
  load: async () => {},
  dispose: async () => {},
  recognize: async (text, ctx) =>
    [
      ["Claire Martin", "PERSON"],
      ["Lausanne", "LOCATION"],
    ].flatMap(([value, entityType]) => {
      const start = text.indexOf(value!);
      return start < 0
        ? []
        : [
            {
              id: ctx.nextId(),
              start,
              end: start + value!.length,
              entityType: entityType as "PERSON" | "LOCATION",
              score: 0.99,
              recognizerId: "ner/fictif",
              packId: "ner",
              source: "ner" as const,
              explanation: [],
            },
          ];
    }),
};

function setup() {
  const service: AnalysisService = {
    start(params) {
      const rules = app.registry
        .activeRules()
        .filter((r) => params.activeRuleIds.includes(r.globalId));
      const analyzer = createAnalyzer(rules);
      return {
        result: analyzer.analyze(params.text, {
          manual: params.manual,
          minScore: params.minScore,
          language: "fr",
          ner,
        }),
        cancel() {},
      };
    },
    dispose() {},
  };
  const app = new AppState({ service });
  app.setText(TEXT);
  return app;
}

async function analyzed() {
  const app = setup();
  await app.analyze();
  return app;
}

describe("AppState : nettoyage par catégorie (#26)", () => {
  it("sélectionne toutes les catégories par défaut et les conserve pour le document suivant", () => {
    const app = setup();
    expect(app.cleaningCategories).toEqual(ALL_CLEANING_CATEGORIES);
    app.setCleaningCategories(["identity", "addresses"]);
    app.reset();
    expect(app.cleaningCategories).toEqual(["identity", "addresses"]);
    app.resetCleaningCategories();
    expect(app.cleaningCategories).toEqual(ALL_CLEANING_CATEGORIES);
  });

  it("ne remplace que les catégories choisies, NER et propagation compris", async () => {
    const app = await analyzed();
    app.setMode("pseudonymization");
    app.setOperatorForType("PERSON", "categorize");
    app.setOperatorForType("LOCATION", "categorize");
    app.setCleaningCategories(["identity", "addresses"]);
    const output = app.refreshTransform()!;
    expect(output.text).not.toContain("Claire Martin");
    expect(output.text).not.toContain("CMARTIN");
    expect(output.text).not.toContain("18 rue des Mélèzes");
    expect(output.text).not.toContain("1205 Genève");
    for (const readable of [
      "12 mars 1985",
      "Lausanne",
      "probe@example.org",
      "+41 79 234 56 78",
      "192.0.2.1",
    ])
      expect(output.text).toContain(readable);
    expect(app.detections.some((d) => d.source === "ner")).toBe(true);
    expect(app.detections.some((d) => d.recognizerId === "core/name-propagation")).toBe(true);
    expect(app.detections.some((d) => d.recognizerId === "core/address-merge")).toBe(true);
  });

  it("actualise la sélection sans relancer l’analyse et retire la validation avant copie", async () => {
    const app = await analyzed();
    const originalAnalysis = app.analysis;
    app.refreshTransform();
    expect(app.validate()).toBe(true);
    expect(app.canCopy).toBe(true);
    app.setCleaningCategory("dates", false);
    expect(app.analysis).toBe(originalAnalysis);
    expect(app.analysisStale).toBe(false);
    expect(app.transformed).toBeNull();
    expect(app.validated).toBe(false);
    expect(app.canCopy).toBe(false);
    expect(app.refreshTransform()?.text).toContain("12 mars 1985");
    expect(app.canCopy).toBe(false);
  });

  it("ne remplace rien sans catégorie et rétablit les valeurs par défaut", async () => {
    const app = await analyzed();
    app.setCleaningCategories([]);
    expect(app.detectionCount).toBe(0);
    expect(app.refreshTransform()?.text).toBe(TEXT);
    app.resetCleaningCategories();
    expect(app.refreshTransform()?.text).not.toBe(TEXT);
  });

  it("respecte les corrections manuelles et les suppressions avant le choix des catégories", async () => {
    const app = await analyzed();
    const email = app.analysis!.detections.find((d) => d.entityType === "EMAIL")!;
    app.setDetectionOperator(email.id, "categorize");
    app.setCleaningCategories([]);
    expect(app.refreshTransform()?.text).toContain("[EMAIL]");
    app.removeDetection(email.id);
    expect(app.refreshTransform()?.text).toBe(TEXT);
    app.restoreDetection(email.id);
    expect(app.refreshTransform()?.text).toContain("[EMAIL]");
    app.setDetectionOperator(email.id, null);
    app.setDetectionType(email.id, "URL");
    expect(app.detections.map((d) => d.entityType)).toEqual(["URL"]);
    app.setDetectionType(email.id, null);
    expect(app.refreshTransform()?.text).toBe(TEXT);
  });

  it("un opérateur global ne réactive pas une catégorie décochée", async () => {
    const app = await analyzed();
    app.setOperatorForType("EMAIL", "categorize");
    app.setCleaningCategory("emails", false);
    expect(app.refreshTransform()?.text).toContain("probe@example.org");
  });

  it("les réglages de règles restent prioritaires pour la détection", async () => {
    const app = setup();
    app.setPackEnabled("dates", false);
    app.setCleaningCategories(["dates"]);
    await app.analyze();
    expect(app.refreshTransform()?.text).toBe(TEXT);
  });

  it("applique le dernier choix même s’il change pendant une analyse", async () => {
    const app = setup();
    const running = app.analyze();
    app.setCleaningCategories(["emails"]);
    await running;
    expect(app.analysisStale).toBe(false);
    expect(app.detections.map((d) => d.entityType)).toEqual(["EMAIL"]);
  });

  it("conserve les pseudonymes après désélection et réactivation d’une catégorie", async () => {
    const app = await analyzed();
    app.setMode("pseudonymization");
    app.setCleaningCategories(["emails"]);
    const first = app.refreshTransform()!;
    const session = app.session!;
    const restored = reidentify(first.text, session).text;
    expect(restored).toBe(TEXT);
    app.setCleaningCategories([]);
    expect(app.refreshTransform()?.text).toBe(TEXT);
    app.setCleaningCategories(["emails"]);
    expect(app.refreshTransform()?.text).toBe(first.text);
    expect(app.session).toBe(session);
  });
});
