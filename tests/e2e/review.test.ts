import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { RESULT_PREVIEW, SKIP_MESSAGE, Session, chromeOrNull } from "./harness.ts";

const preview = `document.querySelector('${RESULT_PREVIEW}').textContent`;

/** Case de l'entité qui contient `value` dans la colonne « À vérifier » (une seule forme ici). */
const formBox = (value: string) =>
  `[...document.querySelectorAll('#verifier .entity')].find(e => e.textContent.includes(${JSON.stringify(value)}))?.querySelector('.entity-title input')`;

describe(
  "parcours sur une page : vérification et corrections (#38)",
  { skip: chromeOrNull() ? false : SKIP_MESSAGE },
  () => {
    let s: Session;

    before(async () => {
      s = await Session.start();
      await s.send("Emulation.setDeviceMetricsOverride", {
        width: 1400,
        height: 900,
        deviceScaleFactor: 1,
        mobile: false,
      });
      await s.navigate("/");
      await s.type("#source-text", "Contact : exemple@example.org. Référence : dossierfictif.");
      // Aucun bouton : l'analyse se lance après la pause de saisie.
      await s.waitForResult();
    });

    after(async () => {
      await s?.close();
    });

    it("affiche texte, vérification et résultat côte à côte, sans navigation par étapes", async () => {
      assert.equal(
        await s.evaluate<boolean>(
          `Boolean(document.querySelector('nav[aria-label="Étapes du parcours"]'))`,
        ),
        false,
      );
      assert.ok(await s.evaluate<boolean>(`Boolean(${formBox("exemple@example.org")})`));
      assert.ok(!(await s.evaluate<string>(preview)).includes("exemple@example.org"));
      // Sans correction, le texte reste modifiable.
      assert.ok(await s.evaluate<boolean>(`Boolean(document.querySelector('#source-text'))`));
      // Les trois colonnes sont sur une même ligne en grand écran.
      assert.ok(
        await s.evaluate<boolean>(`(() => {
          const tops = ['#texte', '#verifier', '#resultat'].map(id => Math.round(document.querySelector(id).getBoundingClientRect().top));
          return tops.every(t => t === tops[0]);
        })()`),
      );
    });

    it("décocher une forme la garde en clair, retire la validation et fige le texte", async () => {
      await s.evaluate(`document.querySelector('.validate input').click()`);
      await s.evaluate(`(${formBox("exemple@example.org")}).click()`);
      await s.waitFor(`${preview}.includes('exemple@example.org')`, "forme laissée en clair");
      assert.equal(
        await s.evaluate<boolean>(`document.querySelector('.validate input').checked`),
        false,
      );
      await s.waitFor(`document.querySelector('#review-text')`, "texte figé après correction");
      assert.equal(
        await s.evaluate<boolean>(`Boolean(document.querySelector('#source-text'))`),
        false,
      );
      await s.evaluate(`(${formBox("exemple@example.org")}).click()`);
      await s.waitFor(`!${preview}.includes('exemple@example.org')`, "forme de nouveau remplacée");
    });

    it("ajoute une donnée oubliée depuis une sélection dans la zone de saisie", async () => {
      // Sans correction en cours, le texte est dans la zone de saisie : on y sélectionne.
      await s.evaluate(`(() => {
        const area = document.querySelector('#source-text');
        const start = area.value.indexOf('dossierfictif');
        area.focus();
        area.setSelectionRange(start, start + 'dossierfictif'.length);
        area.dispatchEvent(new Event('select'));
      })()`);
      await s.clickButton("Prendre la sélection");
      await s.waitFor(`Boolean(${formBox("dossierfictif")})`, "donnée ajoutée à la vérification");
      await s.waitFor(
        `document.querySelector('${RESULT_PREVIEW}') && !${preview}.includes('dossierfictif')`,
        "donnée remplacée dans le résultat",
      );
    });

    it("« Modifier le texte » demande confirmation puis rend le texte modifiable", async () => {
      await s.clickButton("Modifier le texte");
      await s.clickButton("Oui, modifier");
      await s.waitFor(`document.querySelector('#source-text')`, "texte de nouveau modifiable");
      await s.waitForResult();
      assert.equal(await s.evaluate<boolean>(`Boolean(${formBox("dossierfictif")})`), false);
    });

    it("empile les zones sur téléphone sans débordement horizontal", async () => {
      await s.send("Emulation.setDeviceMetricsOverride", {
        width: 375,
        height: 812,
        deviceScaleFactor: 1,
        mobile: true,
      });
      await s.waitFor(
        `getComputedStyle(document.querySelector('nav.jump')).display !== 'none'`,
        "liens d'accès directs sur téléphone",
      );
      assert.ok(await s.evaluate<boolean>(`document.documentElement.scrollWidth <= innerWidth`));
      assert.deepEqual(s.foreign, []);
    });
  },
);

describe(
  "homonymes : rattachement manuel par occurrence (#12)",
  { skip: chromeOrNull() ? false : SKIP_MESSAGE },
  () => {
    let s: Session;
    before(async () => {
      s = await Session.start();
      await s.navigate("/");
      await s.evaluate(`(() => {
        const select = document.querySelector('.compact-mode select');
        select.value = 'pseudonymization';
        select.dispatchEvent(new Event('change', { bubbles: true }));
      })()`);
      await s.type(
        "#source-text",
        "M. Bernard et Mme Bernard. Hervé Bernard et Christine Bernard.",
      );
      await s.waitForResult();
    });
    after(async () => {
      await s?.close();
    });

    it("permet de distinguer les deux mêmes surfaces et de restituer deux noms complets", async () => {
      await s.waitFor(
        `document.querySelectorAll('.occurrence select').length === 2`,
        "deux occurrences ambiguës",
      );
      const targets = await s.evaluate<string[]>(`(() => {
        const options = [...document.querySelector('.occurrence select').options];
        return ['Hervé Bernard', 'Christine Bernard'].map(name => options.find(o => o.textContent.includes(name)).value);
      })()`);
      assert.notEqual(targets[0], targets[1]);
      const occurrenceIds = await s.evaluate<string[]>(
        `[...document.querySelectorAll('.occurrence select')].map(s => s.id)`,
      );
      await s.evaluate(`document.querySelector('.validate input').click()`);
      for (let i = 0; i < 2; i++) {
        await s.evaluate(`(() => {
          const select = document.getElementById(${JSON.stringify(occurrenceIds[i])});
          select.value = ${JSON.stringify(targets[i])};
          select.dispatchEvent(new Event('change', { bubbles: true }));
        })()`);
        await s.waitFor(
          `${preview}.includes(${JSON.stringify(targets[i])})`,
          "rattachement appliqué",
        );
        await s.waitFor(
          `document.activeElement.id === ${JSON.stringify(occurrenceIds[i])}`,
          "focus conservé sur le choix du passage",
        );
      }
      assert.equal(
        await s.evaluate<string>(preview),
        `M. ${targets[0]} et Mme ${targets[1]}. ${targets[0]} et ${targets[1]}.`,
      );
      assert.equal(
        await s.evaluate<boolean>(`document.querySelector('.validate input').checked`),
        false,
      );
      await s.type("#llm-response", `${targets[0]} et ${targets[1]}`);
      await s.waitFor(
        `document.querySelector('.restored').textContent.includes('Hervé Bernard et Christine Bernard')`,
        "réidentification distincte",
      );
      await s.send("Emulation.setDeviceMetricsOverride", {
        width: 375,
        height: 812,
        deviceScaleFactor: 1,
        mobile: true,
      });
      assert.ok(await s.evaluate<boolean>(`document.documentElement.scrollWidth <= innerWidth`));
      assert.deepEqual(s.foreign, []);
    });
  },
);
