/** Rendu serveur du panneau de détail et de la barre de corrections (sans DOM). */
import { render } from "svelte/server";
import { afterEach, describe, expect, it } from "vitest";
import type { Detection } from "../../core/index.ts";
import { app } from "../state.svelte.ts";
import CorrectionsToolbar from "./CorrectionsToolbar.svelte";
import DetectionDetail from "./DetectionDetail.svelte";

const TEXT = "Écrire à <b>Paul</b> demain";

function det(id: string, start: number, end: number, extra: Partial<Detection> = {}): Detection {
  return {
    id,
    start,
    end,
    entityType: "PERSON",
    score: 0.5,
    recognizerId: "lang-fr-en/prenoms",
    packId: "lang-fr-en",
    source: "dictionary",
    explanation: ["prénom courant (0,45)", "<script>x</script> contexte"],
    ...extra,
  };
}

afterEach(() => app.reset());

describe("DetectionDetail (rendu serveur)", () => {
  it("affiche catégorie, score non probabiliste, origine et explication en texte", () => {
    app.text = TEXT;
    app.analysis = { detections: [det("d1", 9, 19)], discarded: [], warnings: [] };
    app.selectDetection("d1");
    const html = render(DetectionDetail).body;
    expect(html).toContain("Personne");
    expect(html).toContain("0,50");
    expect(html).toContain("pas une probabilité");
    expect(html).toContain("Règle (dictionnaire)");
    expect(html).toContain("prénom courant");
    expect(html).toContain("Masque (***)");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<b>Paul");
  });

  it("invite à sélectionner quand rien n'est choisi", () => {
    app.text = TEXT;
    app.analysis = { detections: [], discarded: [], warnings: [] };
    expect(render(DetectionDetail).body).toContain("Sélectionnez une détection");
  });
});

describe("CorrectionsToolbar (rendu serveur)", () => {
  it("propose la propagation, cochée par défaut, et pas de pseudonyme en masquage", () => {
    app.text = TEXT;
    app.analysis = { detections: [det("d1", 9, 19)], discarded: [], warnings: [] };
    app.selectDetection("d1");
    const html = render(CorrectionsToolbar).body;
    expect(html).toMatch(/<input[^>]*type="checkbox"[^>]*checked/);
    expect(html).toContain("Appliquer à toutes les occurrences");
    expect(html).not.toContain("Pseudonyme (PERSONNE_001)");
  });

  it("liste les détections supprimées avec un bouton Restaurer", () => {
    app.text = TEXT;
    app.analysis = { detections: [det("d1", 9, 19)], discarded: [], warnings: [] };
    app.removeDetection("d1");
    expect(render(CorrectionsToolbar).body).toContain("Restaurer");
  });
});
