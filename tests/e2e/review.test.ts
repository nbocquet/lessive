import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { SKIP_MESSAGE, Session, chromeOrNull } from "./harness.ts";

describe(
  "vérification : corrections contextuelles",
  { skip: chromeOrNull() ? false : SKIP_MESSAGE },
  () => {
    let s: Session;

    before(async () => {
      s = await Session.start();
      await s.navigate("/");
      await s.type("#source-text", "Contact : exemple@example.org. Référence : dossierfictif.");
      await s.clickButton("Analyser");
      // Sans modèle, l'absence de NER est déjà annoncée en tête d'écran : aucun avis nouveau ne
      // retient l'utilisateur sur « Texte », l'application passe directement à la vérification.
      await s.waitFor(`document.querySelector("#h-review")`, "passage direct à la vérification");
    });

    after(async () => {
      await s?.close();
    });

    it("garde la navigation au-dessus du texte sans afficher de formulaire inactif", async () => {
      assert.equal(await s.evaluate<boolean>(`Boolean(document.querySelector('#rv-type'))`), false);
      assert.equal(
        await s.evaluate<boolean>(`document.querySelector('details.add-missing').open`),
        false,
      );
      assert.ok(
        await s.evaluate<boolean>(
          `Boolean(document.querySelector('.review-header').compareDocumentPosition(document.querySelector('#review-text')) & Node.DOCUMENT_POSITION_FOLLOWING)`,
        ),
      );
      assert.ok(
        await s.evaluate<boolean>(
          `(() => { const button = [...document.querySelectorAll('.review-header button')].find(b => b.textContent.trim() === 'Voir le résultat'); const r = button.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; })()`,
        ),
      );
    });

    it("affiche d'abord la correction du passage et replie les explications", async () => {
      await s.evaluate(`document.querySelector('#review-text [role="button"]').click()`);
      await s.waitFor(`document.querySelector('#rv-type')`, "correction du passage sélectionné");
      assert.equal(
        await s.evaluate<boolean>(`document.querySelector('details.technical').open`),
        false,
      );
      assert.ok(
        await s.evaluate<boolean>(
          `Boolean(document.querySelector('#rv-type').compareDocumentPosition(document.querySelector('details.add-missing')) & Node.DOCUMENT_POSITION_FOLLOWING)`,
        ),
      );
      await s.clickButton("Laisser ce passage en clair");
      await s.waitFor(`!document.querySelector('#rv-type')`, "passage laissé en clair");
      await s.evaluate(
        `document.querySelector('[aria-label="Corrections"] details:last-child').open = true`,
      );
      await s.clickButton("Restaurer");
      await s.waitFor(`document.querySelector('#rv-type')`, "passage restauré");
    });

    it("ouvre l'ajout dès qu'un passage non détecté est sélectionné", async () => {
      await s.evaluate(`(() => {
      const span = [...document.querySelectorAll('#review-text span[data-start]')].find(el => el.textContent.includes('dossierfictif'));
      const start = span.textContent.indexOf('dossierfictif');
      const range = document.createRange();
      range.setStart(span.firstChild, start);
      range.setEnd(span.firstChild, start + 'dossierfictif'.length);
      const selection = getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      document.dispatchEvent(new Event('selectionchange'));
    })()`);
      await s.waitFor(
        `document.querySelector('details.add-missing').open`,
        "ajout ouvert sur sélection",
      );
      await s.clickButton("Ajouter");
      await s.waitFor(
        `document.querySelector('#review-text [aria-label="Personne : dossierfictif"]')`,
        "passage ajouté à la détection",
      );
    });

    it("affiche les commandes sélectionnées sur téléphone sans débordement horizontal", async () => {
      await s.send("Emulation.setDeviceMetricsOverride", {
        width: 375,
        height: 812,
        deviceScaleFactor: 1,
        mobile: true,
      });
      await s.evaluate(`document.querySelector('#review-text [role="button"]').click()`);
      await s.waitFor(`document.querySelector('#rv-type')`, "commandes sur téléphone");
      assert.ok(await s.evaluate<boolean>(`document.documentElement.scrollWidth <= innerWidth`));
      await s.waitFor(
        `(() => { const r = document.querySelector('aside.side').getBoundingClientRect(); return r.top >= -1 && r.top < innerHeight; })()`,
        "panneau de correction visible",
      );
      assert.deepEqual(s.foreign, []);
    });
  },
);
