/**
 * T6.1 — Tests de confidentialité de bout en bout (AC-01, AC-11), dans Chrome headless piloté par CDP.
 * Lancer : `npm run test:e2e` (construit l'application puis exécute ces tests).
 */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  DIST,
  INPUT_TEXT,
  NEEDLES,
  SENSITIVE,
  SKIP_MESSAGE,
  Session,
  chromeOrNull,
  distFiles,
} from "./harness.ts";

const chrome = chromeOrNull();

describe("confidentialité (e2e)", { skip: chrome ? false : SKIP_MESSAGE }, () => {
  let s: Session;
  let journey: Awaited<ReturnType<Session["runJourney"]>>;

  before(async () => {
    s = await Session.start();
    await s.navigate("/");
    await s.evaluate(`(() => {
      window.__csp = [];
      document.addEventListener("securitypolicyviolation", (e) => window.__csp.push({ directive: e.violatedDirective, blocked: e.blockedURI }));
    })()`);
  });

  after(async () => {
    await s?.close();
  });

  it("déroule le parcours complet sans que les valeurs ne subsistent dans le texte transformé", async () => {
    journey = await s.runJourney({ ner: false });
    for (const value of [SENSITIVE.email, SENSITIVE.iban, SENSITIVE.avs, "756.9217"]) {
      assert.ok(
        !journey.transformed.includes(value),
        `le texte transformé contient encore « ${value} »`,
      );
    }
    assert.ok(
      journey.tokens.length >= 3,
      `pseudonymes attendus (courriel, IBAN, AVS), vus : ${journey.tokens.join(", ")}`,
    );
    // Réidentification : les valeurs reviennent, aucun pseudonyme ne reste.
    for (const value of [SENSITIVE.email, SENSITIVE.iban, SENSITIVE.avs]) {
      assert.ok(
        journey.reidentified.includes(value),
        `valeur non réidentifiée : ${value.slice(0, 4)}…`,
      );
    }
    for (const token of journey.tokens) {
      assert.ok(
        !journey.reidentified.includes(token),
        `pseudonyme resté dans la réponse : ${token}`,
      );
    }
  });

  it("aucune requête hors de l'origine locale, y compris workers et service worker", async () => {
    assert.deepEqual(s.foreign, [], "requêtes vers une autre origine");
    // Preuve que l'observation couvre bien la page, le worker d'analyse et le service worker.
    assert.ok(s.observedTargets().includes("page"), "requêtes de la page non observées");
    for (const type of ["worker", "service_worker"]) {
      assert.ok(
        s.attachedTypes.has(type),
        `cible « ${type} » non observée (vues : ${[...s.attachedTypes].join(", ")})`,
      );
    }
  });

  it("n'écrit le texte d'entrée dans aucun stockage ; le cache ne contient que l'application", async () => {
    // Laisse au service worker le temps d'ouvrir ses caches.
    await s.waitFor(`navigator.serviceWorker.controller`, "service worker actif", 30_000);
    await s.waitFor(`caches.keys().then((k) => k.length > 0)`, "cache du service worker", 30_000);
    const report = await s.inspectStorage([
      ...NEEDLES,
      SENSITIVE.email,
      SENSITIVE.avs,
      SENSITIVE.name,
    ]);
    assert.deepEqual(report.hits, [], "valeur du texte retrouvée dans un stockage");
    assert.equal(report.localStorage, 0, "localStorage non vide");
    assert.equal(report.sessionStorage, 0, "sessionStorage non vide");
    assert.deepEqual(report.indexedDbs, [], "base IndexedDB créée");
    const known = new Set(distFiles().map((f) => `${s.origin}/${f}`));
    known.add(`${s.origin}/`);
    const cachedUrls = report.cache.flatMap((c) => c.urls);
    assert.ok(cachedUrls.length > 0, "aucune ressource en cache");
    for (const url of cachedUrls) {
      assert.ok(
        known.has(url),
        `ressource en cache qui n'est pas un fichier de l'application : ${url}`,
      );
    }
    // Aucune réponse mise en cache n'est une réponse d'un autre fichier que ceux de dist/.
    assert.ok(
      report.cache.every((c) => /^(lessive-|transformers-cache|lessive-models-)/.test(c.name)),
      `caches inattendus : ${report.cache.map((c) => c.name).join(", ")}`,
    );
  });

  it("applique réellement la CSP : un fetch vers https://example.com est bloqué", async () => {
    const outcome = await s.evaluate<string>(
      `fetch("https://example.com/").then(() => "envoyé", () => "bloqué")`,
    );
    assert.equal(outcome, "bloqué");
    await s.evaluate(
      `new Promise((r) => { const i = new Image(); i.onerror = i.onload = () => r(); i.src = "https://example.com/p.png"; })`,
    );
    const violations = await s.evaluate<{ directive: string; blocked: string }[]>(`window.__csp`);
    assert.ok(
      violations.some(
        (v) => v.directive.startsWith("connect-src") && v.blocked.includes("example.com"),
      ),
      "pas de violation connect-src signalée par la CSP",
    );
    assert.ok(
      violations.some((v) => v.directive.startsWith("img-src")),
      "pas de violation img-src signalée par la CSP",
    );
    // Bloqué par la CSP elle-même, pas par notre interception : aucune requête n'est partie.
    assert.deepEqual(s.foreign, [], "une requête vers example.com est partie malgré la CSP");
  });

  it("le rechargement efface le texte et la session (R5)", async () => {
    await s.reload();
    assert.equal(await s.evaluate<string>(`document.querySelector("#source-text").value`), "");
    const body = await s.text("body");
    for (const needle of NEEDLES.slice(0, 7))
      assert.ok(!body.includes(needle), `texte encore affiché : ${needle}`);
    // Pas de session : vérification et résultat sont inaccessibles (l'écran « Réponse du LLM » reste
    // ouvert : on peut y importer une table chiffrée, T4.5).
    const disabled = await s.evaluate<string[]>(
      `[...document.querySelectorAll("nav button")].filter((b) => b.disabled).map((b) => b.textContent.trim())`,
    );
    assert.deepEqual(disabled, ["2. Vérification", "3. Résultat"]);
    const report = await s.inspectStorage(NEEDLES);
    assert.deepEqual(report.hits, []);
    assert.equal(INPUT_TEXT.length > 0, true);
    assert.deepEqual(s.foreign, []);
  });

  // Parcours avec NER : nécessite l'écran de chargement du modèle par l'utilisateur (amendement A20,
  // autre agent) et un modèle sur disque. Sans l'un ou l'autre, le test est sauté avec la raison.
  it("parcours avec NER : modèle chargé depuis le dossier local, nom pseudonymisé, aucun stockage", async (t) => {
    const picker = `document.querySelector('input[type="file"][webkitdirectory]')`;
    const modelDir = [
      "/mnt/user-data/uploads/lessive/models/Xenova/distilbert-base-multilingual-cased-ner-hrl",
      join(DIST, "..", "models", "Xenova", "distilbert-base-multilingual-cased-ner-hrl"),
    ].find((d) => existsSync(join(d, "config.json")));
    if (!(await s.evaluate<boolean>(`Boolean(${picker})`))) {
      t.skip(
        "sélecteur de dossier du modèle absent de l'interface (livraison de l'autre agent en attente)",
      );
      return;
    }
    if (!modelDir) {
      t.skip("aucun modèle NER sur disque (models/ ou /mnt/user-data/uploads/lessive/models/)");
      return;
    }
    // Chrome attend le dossier lui-même pour un champ « webkitdirectory » (il en énumère les fichiers).
    await s.reload();
    const { root } = (await s.send("DOM.getDocument", { depth: 0 })) as {
      root: { nodeId: number };
    };
    const { nodeId } = (await s.send("DOM.querySelector", {
      nodeId: root.nodeId,
      selector: 'input[type="file"][webkitdirectory]',
    })) as { nodeId: number };
    await s.send("DOM.setFileInputFiles", { nodeId, files: [modelDir] });
    await s.waitFor(
      `document.querySelector(".model")?.textContent.includes("Modèle chargé")`,
      "chargement du modèle par l'utilisateur",
      120_000,
    );
    const ner = await s.runJourney({ ner: true });
    assert.ok(!ner.transformed.includes(SENSITIVE.name), "nom non remplacé avec le NER");
    assert.ok(ner.reidentified.includes(SENSITIVE.name), "nom non réidentifié");
    const report = await s.inspectStorage([...NEEDLES, SENSITIVE.name]);
    assert.deepEqual(
      report.hits,
      [],
      "valeur du texte retrouvée dans un stockage (caches « lessive-models-* » compris)",
    );
    assert.deepEqual(s.foreign, []);
  });
});
