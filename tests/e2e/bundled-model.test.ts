/**
 * Modèle fourni (ADR 0004), dans Chrome headless : rien n'est téléchargé avant le clic, l'installation
 * passe par la même origine, le NER pseudonymise ensuite le nom, et aucun texte n'est stocké.
 *
 * Le test ajoute le modèle à `dist/` (comme le build de publication avec `LESSIVE_BUNDLED_MODEL`) puis
 * le retire. Sauté si `Xenova/camembert-ner` n'est pas sur disque.
 */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { writeBundle } from "../../scripts/bundled-model.ts";
import { DIST, NEEDLES, SENSITIVE, SKIP_MESSAGE, Session, chromeOrNull } from "./harness.ts";

const chrome = chromeOrNull();
const MODEL_DIR = [
  join(DIST, "..", "models", "Xenova", "camembert-ner"),
  "/mnt/user-data/uploads/lessive/models/Xenova/camembert-ner",
].find((d) => existsSync(join(d, "onnx", "model_quantized.onnx")));
const BUNDLE = join(DIST, "models");

const skip = !chrome ? SKIP_MESSAGE : !MODEL_DIR ? "Xenova/camembert-ner absent du disque" : false;

describe("modèle fourni (e2e)", { skip }, () => {
  let s: Session;

  before(async () => {
    writeBundle(DIST, MODEL_DIR ?? "");
    s = await Session.start();
  });

  after(async () => {
    await s?.close();
    rmSync(BUNDLE, { recursive: true, force: true });
  });

  it("propose le modèle sans le télécharger, l'installe au clic, puis s'en sert", async () => {
    await s.navigate("/");
    await s.waitFor(
      `document.body.textContent.includes("Installer le modèle fourni")`,
      "proposition du modèle fourni",
    );
    const before = s.server.requests.filter((p) => p.startsWith("/models/"));
    assert.deepEqual(
      before,
      ["/models/bundled/bundle.json"],
      "seule la fiche est lue avant le clic",
    );

    await s.clickButton("Installer le modèle fourni");
    await s.waitFor(
      `document.querySelector(".model .info")?.textContent.includes("Xenova/camembert-ner")`,
      "installation du modèle fourni",
      120_000,
    );
    assert.ok(
      s.server.requests.includes("/models/bundled/onnx/model_quantized.onnx"),
      "le modèle vient de l'origine de l'application",
    );

    const ner = await s.runJourney({ ner: true });
    assert.ok(!ner.transformed.includes(SENSITIVE.name), "nom non remplacé avec le NER");
    assert.ok(ner.reidentified.includes(SENSITIVE.name), "nom non réidentifié");

    // Le vocabulaire du modèle contient des suites de chiffres (« 7569217 ») : un fragment déjà présent
    // dans les fichiers du modèle ne prouve rien, on ne le cherche pas.
    const vocab = readFileSync(join(MODEL_DIR ?? "", "tokenizer.json"), "utf8");
    const needles = [...NEEDLES, SENSITIVE.name].filter((n) => !vocab.includes(n));
    assert.ok(needles.includes(SENSITIVE.name) && needles.length >= NEEDLES.length - 2);
    const report = await s.inspectStorage(needles);
    assert.deepEqual(report.hits, [], "valeur du texte retrouvée dans un stockage");
    assert.ok(
      report.cache.some((c) => c.name === "lessive-models-v1"),
      "modèle conservé dans le cache de l'application",
    );
    assert.deepEqual(s.foreign, []);
  });
});
