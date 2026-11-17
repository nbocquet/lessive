/**
 * T6.2 — Fonctionnement hors ligne (service worker), dans Chrome headless piloté par CDP.
 * Lancer : `npm run test:e2e`.
 */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { SENSITIVE, SKIP_MESSAGE, Session, chromeOrNull, distFiles } from "./harness.ts";

const chrome = chromeOrNull();

describe("hors ligne (e2e)", { skip: chrome ? false : SKIP_MESSAGE }, () => {
  let s: Session;

  before(async () => {
    s = await Session.start();
    await s.navigate("/");
  });

  after(async () => {
    await s?.close();
  });

  const cacheNames = () => s.evaluate<string[]>(`caches.keys()`);

  it("met en cache l'application et ONNX Runtime, jamais le modèle ni autre chose", async () => {
    await s.waitFor(`navigator.serviceWorker.controller`, "service worker actif", 30_000);
    // Les fichiers lourds sont demandés par la page environ 1,5 s après son chargement.
    await s.waitFor(
      `caches.keys().then(async (k) => { const d = k.find((n) => n.startsWith("lessive-data-")); return d && (await (await caches.open(d)).keys()).length >= 2; })`,
      "mise en cache d'ONNX Runtime",
      60_000,
    );
    const names = await cacheNames();
    assert.ok(
      names.some((n) => n.startsWith("lessive-app-")),
      `caches : ${names.join(", ")}`,
    );
    assert.ok(
      names.every((n) => /^lessive-(app|data)-/.test(n)),
      `caches inattendus : ${names.join(", ")}`,
    );
    const urls = (await s.inspectStorage([])).cache.flatMap((c) => c.urls);
    const expected = distFiles().filter((f) => f !== "sw.js" && !f.startsWith("models/"));
    for (const f of expected)
      assert.ok(urls.includes(`${s.origin}/${f}`), `fichier absent du cache : ${f}`);
    assert.ok(
      !urls.some((u) => u.includes("/models/")),
      "le modèle NER ne doit pas être pré-caché",
    );
    assert.ok(
      urls.some((u) => u.includes("/ort/") && u.endsWith(".wasm")),
      "WASM d'ONNX Runtime non mis en cache",
    );
  });

  it("après un premier chargement, réseau coupé : rechargement et nouvelle analyse par règles", async () => {
    await s.setOffline(true);
    // Preuve que le réseau est bien coupé, serveur arrêté compris : la page vient du cache.
    await s.server.close();
    const outcome = await s.evaluate<string>(
      `fetch("/assets/inexistant.js", { cache: "reload" }).then(() => "réponse", () => "échec")`,
    );
    assert.equal(outcome, "échec", "le réseau n'est pas coupé");
    await s.reload();
    const journey = await s.runJourney({ ner: false });
    for (const value of [SENSITIVE.email, SENSITIVE.iban, SENSITIVE.avs]) {
      assert.ok(!journey.transformed.includes(value), "valeur non remplacée hors ligne");
      assert.ok(journey.reidentified.includes(value), "valeur non réidentifiée hors ligne");
    }
    assert.deepEqual(s.foreign, [], "requête vers une autre origine");
  });
});

describe("service worker : nouvelle version (e2e)", { skip: chrome ? false : SKIP_MESSAGE }, () => {
  let s: Session;

  before(async () => {
    s = await Session.start();
    await s.navigate("/");
  });

  after(async () => {
    await s?.close();
  });

  it("remplace ses propres anciens caches et ne touche jamais à « lessive-models-* » ni aux autres", async () => {
    await s.waitFor(`navigator.serviceWorker.controller`, "service worker actif", 30_000);
    // Simule les caches d'une version précédente, le cache du modèle (écrit par l'application) et un cache étranger.
    await s.evaluate(`(async () => {
      for (const name of ["lessive-app-ancienne", "lessive-data-ancienne", "lessive-models-v1", "autre-cache"]) {
        await (await caches.open(name)).put("/" + name, new Response("contenu-" + name));
      }
      for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister();
    })()`);
    // Nouvelle installation : le service worker s'active et nettoie.
    await s.navigate("/");
    await s.waitFor(
      `navigator.serviceWorker.controller`,
      "service worker actif (nouvelle installation)",
      30_000,
    );
    await s.waitFor(
      `caches.keys().then((k) => !k.includes("lessive-app-ancienne") && k.some((n) => n.startsWith("lessive-app-")))`,
      "suppression des anciens caches",
      30_000,
    );
    const names = await cacheNames();
    assert.ok(!names.includes("lessive-data-ancienne"), "ancien cache de données conservé");
    assert.ok(
      names.includes("lessive-models-v1"),
      "cache du modèle supprimé par le service worker",
    );
    assert.ok(names.includes("autre-cache"), "cache étranger supprimé par le service worker");
    const kept = await s.evaluate<string>(
      `caches.open("lessive-models-v1").then((c) => c.match("/lessive-models-v1")).then((r) => r.text())`,
    );
    assert.equal(kept, "contenu-lessive-models-v1");
  });

  const cacheNames = () => s.evaluate<string[]>(`caches.keys()`);
});
