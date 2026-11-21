/**
 * États limites rendus côté serveur : longue liste d'entités, étape 4 sans correspondance, description
 * du Masquage conforme au moteur. Données synthétiques uniquement (R10).
 */
import { render } from "svelte/server";
import { afterEach, describe, expect, it } from "vitest";
import { createSession } from "../../core/index.ts";
import { app } from "../state.svelte.ts";
import ReidentifyScreen from "../screens/ReidentifyScreen.svelte";
import ModeSelect from "./ModeSelect.svelte";
import PseudoEntityList from "./PseudoEntityList.svelte";

afterEach(() => {
  app.reset();
  // reset() garde la session (elle sert d'un document à l'autre) : on repart d'une table vide.
  app.newSession();
});

/** Pseudonymes distincts affichés (un même repère figure aussi dans les libellés d'action). */
const shown = (html: string): number => new Set(html.match(/EMAIL_\d{3}/g) ?? []).size;

function sessionWith(count: number) {
  const session = createSession();
  for (let i = 0; i < count; i++) session.resolve(`contact${i}@example.org`, "EMAIL");
  return session;
}

describe("liste des entités : document à très nombreuses valeurs", () => {
  it("écourte la liste au-delà de 20 entités et propose d'afficher le reste", () => {
    app.setMode("pseudonymization");
    app.replaceSession(sessionWith(300));
    const html = render(PseudoEntityList).body;
    expect(html).toContain("Entités de la session (300)");
    expect(shown(html)).toBe(20);
    expect(html).toContain("Afficher les 280");
    expect(html).toContain('aria-expanded="false"');
    // Le pseudonyme est rendu en jeton (capsule reprise du logo).
    expect(html).toMatch(/class="token[^"]*">EMAIL_001</);
  });

  it("affiche tout et sans bouton sous le seuil", () => {
    app.setMode("pseudonymization");
    app.replaceSession(sessionWith(5));
    const html = render(PseudoEntityList).body;
    expect(shown(html)).toBe(5);
    expect(html).not.toContain("Afficher les");
  });
});

describe("étape 4 sans correspondance : toujours une issue", () => {
  it("en Masquage, explique pourquoi et propose la Pseudonymisation sans champ inutile", () => {
    app.setMode("masking");
    const html = render(ReidentifyScreen).body;
    expect(html).toContain("Rien à réidentifier en Masquage");
    expect(html).toContain("Passer en Pseudonymisation");
    expect(html).toContain("Reprendre une session sauvegardée");
    expect(html).not.toContain('id="llm-response"');
    // Sans analyse, « Retour au résultat » ne mènerait nulle part.
    expect(html).not.toContain("Retour au résultat");
  });

  it("en Pseudonymisation, propose l'import chiffré sur place (après rechargement)", () => {
    app.setMode("pseudonymization");
    const html = render(ReidentifyScreen).body;
    expect(html).toContain("Aucune correspondance en mémoire");
    expect(html).toContain("Importer des correspondances");
    expect(html).toContain('id="llm-response"');
    expect(html).not.toContain("depuis l'écran « Résultat »");
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
