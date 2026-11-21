import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { SKIP_MESSAGE, Session, chromeOrNull } from "./harness.ts";

const TEXT =
  "Claire Martin, née le 12 mars 1985. Adresse : 18 rue des Mélèzes, 1205 Genève. Courriel probe@example.org. IP 192.0.2.1.";

describe(
  "choix des catégories à nettoyer (#26)",
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

    it("permet un choix au clavier puis remplace seulement l’identité et l’adresse", async () => {
      await s.type("#source-text", TEXT);
      assert.equal(
        await s.evaluate<number>(
          `document.querySelectorAll('.cleaning-categories input:checked').length`,
        ),
        12,
      );
      await s.clickButton("Tout désélectionner");
      await s.evaluate(`document.querySelector('#cleaning-identity').focus()`);
      await s.send("Input.dispatchKeyEvent", {
        type: "keyDown",
        key: " ",
        code: "Space",
        windowsVirtualKeyCode: 32,
      });
      await s.send("Input.dispatchKeyEvent", {
        type: "keyUp",
        key: " ",
        code: "Space",
        windowsVirtualKeyCode: 32,
      });
      await s.waitFor(
        `document.querySelector('#cleaning-identity').checked`,
        "catégorie activée au clavier",
      );
      await s.evaluate(`document.querySelector('#cleaning-addresses').click()`);
      await s.analyzeAndReview();
      await s.clickButton("Voir le résultat");
      await s.waitFor(
        `document.querySelector('[aria-labelledby="h-after"]')`,
        "aperçu du résultat",
      );
      const output = await s.evaluate<string>(
        `document.querySelector('[aria-labelledby="h-after"]').textContent`,
      );
      assert.ok(!output.includes("Claire Martin"));
      assert.ok(!output.includes("18 rue des Mélèzes"));
      assert.ok(!output.includes("1205 Genève"));
      for (const value of ["12 mars 1985", "probe@example.org", "192.0.2.1"])
        assert.ok(output.includes(value));
    });

    it("actualise l’aperçu et exige une nouvelle validation avant copie", async () => {
      await s.evaluate(`document.querySelector('.validate input').click()`);
      await s.waitFor(
        `![...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Copier le texte').disabled`,
        "copie autorisée après validation",
      );
      await s.evaluate(`document.querySelector('#cleaning-dates').click()`);
      await s.waitFor(
        `!document.querySelector('[aria-labelledby="h-after"]').textContent.includes('12 mars 1985')`,
        "date remplacée sans relancer l’analyse",
      );
      assert.equal(
        await s.evaluate<boolean>(`document.querySelector('.validate input').checked`),
        false,
      );
      assert.equal(
        await s.evaluate<boolean>(
          `[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Copier le texte').disabled`,
        ),
        true,
      );
      await s.clickButton("Tout désélectionner");
      await s.waitFor(
        `document.querySelector('[aria-labelledby="h-after"]').textContent.includes('Claire Martin')`,
        "aperçu sans remplacement automatique",
      );
      assert.ok(
        await s.evaluate<boolean>(
          `document.querySelector('#cleaning-summary').textContent.includes('Aucun remplacement automatique')`,
        ),
      );
      await s.clickButton("Tout sélectionner");
      await s.waitFor(
        `!document.querySelector('[aria-labelledby="h-after"]').textContent.includes('probe@example.org')`,
        "catégories par défaut restaurées",
      );
    });

    it("efface le repli de copie manuelle quand les catégories changent", async () => {
      await s.evaluate(
        `Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new DOMException('Refus synthétique'); } } })`,
      );
      await s.evaluate(`document.querySelector('.validate input').click()`);
      await s.clickButton("Copier le texte");
      await s.waitFor(`document.querySelector('.fallback textarea')`, "champ de copie manuelle");
      await s.evaluate(`document.querySelector('#cleaning-dates').click()`);
      await s.waitFor(
        `!document.querySelector('.fallback textarea')`,
        "ancien texte à copier effacé",
      );
      assert.equal(
        await s.evaluate<boolean>(`document.querySelector('.validate input').checked`),
        false,
      );
    });

    it("n'affiche pas un ancien résultat si le presse-papiers refuse après un changement", async () => {
      await s.evaluate(`
        Object.defineProperty(navigator, 'clipboard', {
          configurable: true,
          value: {
            writeText: () => new Promise((_resolve, reject) => {
              window.__rejectClipboard = () => reject(new DOMException('Refus synthétique'));
            })
          }
        })
      `);
      await s.evaluate(`document.querySelector('.validate input').click()`);
      await s.clickButton("Copier le texte");
      await s.waitFor(`typeof window.__rejectClipboard === 'function'`, "copie en attente");
      await s.evaluate(`document.querySelector('#cleaning-emails').click()`);
      await s.waitFor(`!document.querySelector('.validate input').checked`, "validation retirée");
      await s.evaluate(`window.__rejectClipboard()`);
      await s.evaluate(`new Promise(resolve => setTimeout(resolve, 50))`);
      assert.equal(
        await s.evaluate<boolean>(`Boolean(document.querySelector('.fallback textarea'))`),
        false,
      );
      assert.equal(
        await s.evaluate<string>(`document.querySelector('.copy .status').textContent.trim()`),
        "",
      );
    });

    it("reste lisible et utilisable sur téléphone sans débordement", async () => {
      await s.send("Emulation.setDeviceMetricsOverride", {
        width: 375,
        height: 812,
        deviceScaleFactor: 1,
        mobile: true,
      });
      assert.ok(await s.evaluate<boolean>(`document.documentElement.scrollWidth <= innerWidth`));
      assert.ok(
        await s.evaluate<boolean>(
          `[...document.querySelectorAll('.cleaning-categories label')].every(l => { const r = l.getBoundingClientRect(); return r.width > 0 && r.left >= 0 && r.right <= innerWidth; })`,
        ),
      );
      assert.deepEqual(s.foreign, []);
    });
  },
);
