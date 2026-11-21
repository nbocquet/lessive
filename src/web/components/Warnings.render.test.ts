/**
 * Poids des avertissements : un avis n'est affiché qu'une fois par écran, et les limites permanentes
 * ne prennent pas l'encadré d'alerte réservé à ce qui tient à l'analyse en cours.
 */
import { render } from "svelte/server";
import { afterEach, describe, expect, it } from "vitest";
import type { AnalysisResult } from "../../core/index.ts";
import { NER_INACTIVE_WARNING } from "../../core/analyzer/analyzer.ts";
import { app } from "../state.svelte.ts";
import ResultWarnings from "./ResultWarnings.svelte";

const OTHER = "Avis synthétique propre à cette analyse.";

function analysed(warnings: string[]): void {
  app.analysis = { detections: [], discarded: [], warnings } as unknown as AnalysisResult;
}

afterEach(() => {
  app.reset();
  app.setNer(false);
});

describe("écran « Texte » : pas de doublon avec l'état du modèle", () => {
  it("retire l'avis « sans modèle » quand l'encadré du modèle l'annonce déjà", () => {
    analysed([NER_INACTIVE_WARNING, OTHER]);
    expect(app.modelLimitShown).toBe(true);
    expect(app.newWarnings).toEqual([OTHER]);
    // L'écran « Résultat » garde la liste complète.
    expect(app.warnings).toContain(NER_INACTIVE_WARNING);
  });

  it("garde l'avis quand l'encadré du modèle ne l'annonce pas (chargement en cours)", () => {
    app.modelStatus = "loading";
    analysed([NER_INACTIVE_WARNING]);
    expect(app.newWarnings).toEqual([NER_INACTIVE_WARNING]);
    app.modelStatus = "absent";
  });
});

describe("écran « Résultat » : deux niveaux d'avertissement", () => {
  it("encadre les avis de l'analyse et laisse les limites permanentes en texte d'aide", () => {
    analysed([OTHER]);
    const html = render(ResultWarnings).body;
    const box = html.slice(html.indexOf('class="warnings'), html.indexOf('class="limits'));
    expect(box).toContain(OTHER);
    expect(box).not.toContain("identification indirecte");
    expect(html).toMatch(/class="limits hint[^"]*"[\s\S]*identification indirecte/);
  });

  it("n'affiche pas d'encadré d'alerte sans avis propre à l'analyse", () => {
    app.analysis = {
      detections: [{ id: "d1" }],
      discarded: [],
      warnings: [],
    } as unknown as AnalysisResult;
    const html = render(ResultWarnings).body;
    expect(html).not.toContain('class="warnings');
    expect(html).toContain("identification indirecte");
  });
});
