import { render } from "svelte/server";
import { afterEach, describe, expect, it } from "vitest";
import { app } from "../state.svelte.ts";
import { CLEANING_CATEGORIES } from "../cleaning-categories.ts";
import CleaningCategories from "./CleaningCategories.svelte";

afterEach(() => {
  app.resetCleaningCategories();
  app.reset();
});

describe("choix des catégories : rendu accessible", () => {
  it("affiche des cases nommées, les distinctions d’adresse et les commandes globales", () => {
    const html = render(CleaningCategories).body;
    expect((html.match(/type="checkbox"/g) ?? []).length).toBe(CLEANING_CATEGORIES.length);
    expect((html.match(/checked/g) ?? []).length).toBe(CLEANING_CATEGORIES.length);
    for (const label of [
      "Identité",
      "Dates",
      "Adresses postales",
      "Adresses IP",
      "Lieux",
      "Tout sélectionner",
      "Tout désélectionner",
    ])
      expect(html).toContain(label);
    expect(html).toContain("aria-describedby");
    // Le défaut est « tout coché » : un bouton « Rétablir » ferait doublon avec « Tout sélectionner ».
    expect(html).not.toContain("Rétablir");
  });
  it("annonce clairement ce qui restera lisible et le cas sans sélection", () => {
    app.setCleaningCategories(["identity"]);
    const html = render(CleaningCategories).body;
    expect(html).toContain("Laissé en clair");
    expect((html.match(/checked/g) ?? []).length).toBe(1);
    app.setCleaningCategories([]);
    expect(render(CleaningCategories).body).toContain("Aucun remplacement automatique");
  });
});
