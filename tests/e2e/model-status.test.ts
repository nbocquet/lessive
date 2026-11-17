import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { SKIP_MESSAGE, Session, chromeOrNull } from "./harness.ts";

describe(
  "modèle absent : information et accès aux réglages",
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

    it("explique la limite avant la saisie et ouvre les réglages au bon endroit", async () => {
      const notice = await s.text('[aria-label="Reconnaissance des noms"]');
      assert.ok(notice.includes("Aucun modèle de reconnaissance des noms"));
      assert.ok(notice.includes("risquent de rester en clair"));
      assert.ok(
        await s.evaluate<boolean>(
          `Boolean(document.querySelector('[aria-label="Reconnaissance des noms"]').compareDocumentPosition(document.querySelector('#source-text')) & Node.DOCUMENT_POSITION_FOLLOWING)`,
        ),
      );
      assert.equal(
        await s.evaluate<boolean>(`document.querySelector('details.settings').open`),
        false,
      );

      await s.clickButton("Charger un modèle depuis mon ordinateur");
      assert.equal(
        await s.evaluate<boolean>(`document.querySelector('details.settings').open`),
        true,
      );
      assert.equal(await s.evaluate<string>(`document.activeElement.id`), "settings-model");
      assert.deepEqual(s.foreign, []);
    });
  },
);
