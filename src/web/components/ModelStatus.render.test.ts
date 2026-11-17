import { render } from "svelte/server";
import { afterEach, describe, expect, it } from "vitest";
import { app, type ModelStatus as Status } from "../state.svelte.ts";
import ModelStatus from "./ModelStatus.svelte";

function show(status: Status, ner: boolean): string {
  app.modelStatus = status;
  app.ner = ner;
  return render(ModelStatus, { props: { onConfigure: () => undefined } }).body.replace(/\s+/g, " ");
}

afterEach(() => {
  app.modelStatus = "absent";
  app.modelBusy = false;
  app.modelError = null;
  app.ner = false;
});

describe("état du modèle avant analyse", () => {
  it.each([false, true])("explique l'absence du modèle même avec ner=%s", (ner) => {
    const html = show("absent", ner);
    expect(html).toContain("Aucun modèle de reconnaissance des noms");
    expect(html).toContain("courriels, téléphones et identifiants");
    expect(html).toContain("risquent de rester en clair");
    expect(html).toContain("Charger un modèle depuis mon ordinateur");
    expect(html).not.toContain("Activer la reconnaissance des noms");
  });

  it("propose l'activation lorsque le modèle est disponible mais désactivé", () => {
    const html = show("stored", false);
    expect(html).toContain("reconnaissance des noms est désactivée");
    expect(html).toContain("Activer la reconnaissance des noms");
    expect(html).not.toContain("Charger un modèle depuis mon ordinateur");
  });

  it.each(["stored", "ready"] as const)(
    "indique le modèle actif (%s) sans promettre une détection complète",
    (status) => {
      const html = show(status, true);
      expect(html).toContain("Reconnaissance des noms activée");
      expect(html).toContain("certaines données peuvent échapper");
      expect(html).not.toContain("<button");
    },
  );

  it("distingue un échec et propose de remplacer le modèle", () => {
    const html = show("error", true);
    expect(html).toContain("ne fonctionne pas");
    expect(html).toContain("Vérifier ou remplacer le modèle");
    expect(html).toContain("peuvent rester en clair");
  });

  it("annonce l'installation sans proposer un second chargement", () => {
    app.modelBusy = true;
    const html = show("absent", false);
    expect(html).toContain("Installation du modèle en cours");
    expect(html).not.toContain("<button");
  });

  it("annonce le chargement du moteur sans le présenter comme prêt", () => {
    const html = show("loading", true);
    expect(html).toContain("Chargement du modèle");
    expect(html).not.toContain("Reconnaissance des noms activée");
  });
});
