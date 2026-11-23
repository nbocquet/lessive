/**
 * États limites rendus côté serveur : longue liste d'entités, réponse de l'assistant sans
 * correspondance, description du Masquage conforme au moteur. Données synthétiques uniquement (R10).
 */
import { render } from "svelte/server";
import { afterEach, describe, expect, it } from "vitest";
import type { Detection } from "../../core/index.ts";
import { app } from "../state.svelte.ts";
import EntityReviewList from "./EntityReviewList.svelte";
import ModeSelect from "./ModeSelect.svelte";
import ResponsePane from "./ResponsePane.svelte";

afterEach(() => {
  app.reset();
  // reset() garde la session (elle sert d'un document à l'autre) : on repart d'une table vide.
  app.newSession();
});

/** Texte de `count` courriels distincts, analysé (détections posées directement). */
function analyzedEmails(count: number): void {
  const parts: string[] = [];
  const detections: Detection[] = [];
  let pos = 0;
  for (let i = 0; i < count; i++) {
    const value = `contact${i}@example.org`;
    detections.push({
      id: `d${i + 1}`,
      start: pos,
      end: pos + value.length,
      entityType: "EMAIL",
      score: 1,
      recognizerId: "global/email",
      packId: "global",
      source: "pattern",
      explanation: [],
    });
    parts.push(value);
    pos += value.length + 1;
  }
  app.setText(parts.join(" "));
  app.analysis = { detections, discarded: [], warnings: [] };
  app.analysisStatus = "done";
}

const shownValues = (html: string): number => new Set(html.match(/contact\d+@example\.org/g)).size;

describe("liste « À vérifier » : document à très nombreuses valeurs", () => {
  it("écourte la liste au-delà de 30 entités et propose d'afficher le reste", () => {
    analyzedEmails(300);
    const html = render(EntityReviewList).body;
    expect(shownValues(html)).toBe(30);
    expect(html).toContain("Afficher les 270 autres entités");
  });

  it("affiche tout et sans bouton sous le seuil", () => {
    analyzedEmails(5);
    const html = render(EntityReviewList).body;
    expect(shownValues(html)).toBe(5);
    expect(html).not.toContain("Afficher les");
    expect(html).toContain("Relisez aussi les passages non surlignés");
  });

  it("une seule case par entité à une seule forme, sans bouton en double", () => {
    analyzedEmails(3);
    const html = render(EntityReviewList).body;
    const list = html.slice(
      html.indexOf('class="list'),
      html.indexOf("</ul>", html.lastIndexOf('class="forms')),
    );
    expect(list.match(/type="checkbox"/g)).toHaveLength(3);
    expect(list.match(/aria-label="Remplacer /g)).toHaveLength(3);
    expect(html).not.toContain("Laisser en clair");
  });
});

describe("réponse de l'assistant sans correspondance : toujours une issue", () => {
  it("en Masquage, explique pourquoi et propose la Pseudonymisation sans champ inutile", () => {
    app.setMode("masking");
    const html = render(ResponsePane).body;
    expect(html).toContain("Rien à retrouver en masquage");
    expect(html).toContain("Passer en pseudonymisation");
    expect(html).toContain("Reprendre une session sauvegardée");
    expect(html).not.toContain('id="llm-response"');
  });

  it("en Pseudonymisation, propose l'import chiffré sur place (après rechargement)", () => {
    app.setMode("pseudonymization");
    const html = render(ResponsePane).body;
    expect(html).toContain("Aucune correspondance en mémoire");
    expect(html).toContain("Importer des correspondances");
    expect(html).toContain('id="llm-response"');
  });
});

describe("description du Masquage", () => {
  it("annonce les astérisques produits par défaut, pas une catégorie", () => {
    const html = render(ModeSelect).body;
    expect(html).toContain("astérisques de même longueur");
    expect(html).not.toContain("par un masque ou une catégorie");
    for (const token of ["*****", "[PERSONNE]", "PERSONNE_001"])
      expect(html).toContain(`<span class="token">${token}</span>`);
  });
});
