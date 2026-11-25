/** Mémorisation du choix des catégories sur demande (ADR 0005) : seule clé admise, jamais de texte. */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { RESULT_PREVIEW, SKIP_MESSAGE, Session, chromeOrNull } from "./harness.ts";

// Valeurs inventées et absentes du bundle : un prénom courant y figure légitimement (dictionnaires).
const EMAIL = "qzv-pref-7731@example.org";
const DATE = "3 juin 1993";
const TEXT = `Rendez-vous le ${DATE}. Courriel ${EMAIL}.`;
const KEY = "lessive-preferences-v1";

describe(
  "mémorisation du choix des catégories (ADR 0005)",
  { skip: chromeOrNull() ? false : SKIP_MESSAGE },
  () => {
    let s: Session;
    before(async () => {
      s = await Session.start();
      await s.navigate("/");
    });
    after(async () => {
      await s?.close();
    });

    const openCategories = () =>
      s.evaluate(`document.querySelector('details.categories').open = true`);
    const storageKeys = () => s.evaluate<string[]>(`Object.keys(localStorage)`);

    it("n’écrit rien tant que la mémorisation n’est pas demandée", async () => {
      await s.type("#source-text", TEXT);
      await openCategories();
      await s.evaluate(`document.querySelector('#cleaning-dates').click()`);
      await s.waitForResult();
      assert.deepEqual(await storageKeys(), []);
      assert.equal(
        await s.evaluate<boolean>(`document.querySelector('#cleaning-remember').checked`),
        false,
      );
    });

    it("sur demande, n’enregistre que les catégories décochées, sans texte", async () => {
      await s.evaluate(`document.querySelector('#cleaning-remember').click()`);
      await s.waitFor(`localStorage.getItem(${JSON.stringify(KEY)}) !== null`, "préférence écrite");
      assert.deepEqual(await storageKeys(), [KEY]);
      assert.deepEqual(JSON.parse(await s.evaluate<string>(`localStorage.getItem("${KEY}")`)), {
        v: 1,
        excludedCategories: ["dates"],
      });
      const report = await s.inspectStorage([EMAIL, DATE]);
      assert.deepEqual(report.hits, [], "valeur du texte retrouvée dans un stockage");
      assert.equal(report.sessionStorage, 0);
      assert.deepEqual(report.indexedDbs, []);
    });

    it("après rechargement, rétablit le choix et le signale, sans le texte", async () => {
      await s.reload();
      assert.equal(await s.evaluate<string>(`document.querySelector('#source-text').value`), "");
      await openCategories();
      assert.equal(
        await s.evaluate<boolean>(`document.querySelector('#cleaning-remember').checked`),
        true,
      );
      assert.equal(
        await s.evaluate<boolean>(`document.querySelector('#cleaning-dates').checked`),
        false,
      );
      assert.ok(
        (await s.text("details.categories summary")).includes("choix enregistré"),
        "rappel dans le résumé replié",
      );
      assert.ok((await s.text(".cleaning-categories")).includes("1 catégorie reste lisible"));
      await s.type("#source-text", TEXT);
      await s.waitForResult();
      const output = await s.evaluate<string>(
        `document.querySelector('${RESULT_PREVIEW}').textContent`,
      );
      assert.ok(output.includes(DATE), "les dates restent lisibles");
      assert.ok(!output.includes(EMAIL));
    });

    it("décocher la mémorisation efface la préférence", async () => {
      await openCategories();
      await s.evaluate(`document.querySelector('#cleaning-remember').click()`);
      await s.waitFor(`localStorage.length === 0`, "préférence effacée");
      await s.reload();
      await openCategories();
      assert.equal(
        await s.evaluate<number>(
          `document.querySelectorAll('.cleaning-categories .choices input:checked').length`,
        ),
        12,
      );
    });
  },
);
