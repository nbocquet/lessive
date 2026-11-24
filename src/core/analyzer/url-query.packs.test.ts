import { beforeAll, describe, expect, it } from "vitest";
import { bundledPackDirs, loadPackDir } from "../../../packs/_tools/load.ts";
import { PackRegistry } from "../registry/index.ts";
import { transform } from "../transform/index.ts";
import type { Detection, NerEngine } from "../types/index.ts";
import { createAnalyzer, type Analyzer } from "./analyzer.ts";

let analyzer: Analyzer;
beforeAll(() => {
  const registry = new PackRegistry();
  for (const dir of bundledPackDirs()) registry.register(loadPackDir(dir));
  analyzer = createAnalyzer(registry.activeRules());
});
const plan = { mode: "masking", defaultOperator: "categorize" } as const;
async function clean(text: string) {
  const result = await analyzer.analyze(text);
  return transform(text, result.detections, plan).text;
}

describe("URL encodées avec les packs livrés (#30, #31)", () => {
  it.each([
    "+41794125803",
    "+41+79+412+58+03",
    "%2B41794125803",
    "%2b41%2079%20412%2058%2003",
    "%2B33+6+12+34+56+78",
  ])("remplace tout le téléphone %s", async (phone) => {
    const text = `😀 GET /orders?phone=${phone}&ids=12+34+56 HTTP/1.1`;
    expect(await clean(text)).toBe("😀 GET /orders?phone=[TELEPHONE]&ids=12+34+56 HTTP/1.1");
  });

  it.each(["Romain%20Vuilleumier", "Romain+Vuilleumier", "%52omain%20Vuilleumier"])(
    "remplace tout le nom %s sans NER",
    async (name) => {
      expect(await clean(`GET /c?name=${name}&id=123 HTTP/1.1`)).toBe(
        "GET /c?name=[PERSONNE]&id=123 HTTP/1.1",
      );
    },
  );

  it("retrouve les accents UTF-8 sans modifier un octet hors des remplacements", async () => {
    const text = "😀\tGET /c?name=%C3%89lodie%20Morel&ref=%2520 HTTP/1.1\r\n";
    expect(await clean(text)).toBe("😀\tGET /c?name=[PERSONNE]&ref=%2520 HTTP/1.1\r\n");
  });

  it.each(["romain.vuilleumier%40example.org", "romain.vuilleumier%40example%2Eorg"])(
    "remplace tout le courriel %s",
    async (email) => {
      expect(await clean(`/r?email=${email}&count=2`)).toBe("/r?email=[EMAIL]&count=2");
    },
  );

  it.each([
    "prenom+alias@example.org",
    "prenom%2Balias@example.org",
    "prenom+alias%40example.org",
    "prenom%2Balias%40example.org",
  ])("préserve le + légal du courriel complet %s", async (email) => {
    expect(await clean(`/r?email=${email}&phone=+41+79+412+58+03`)).toBe(
      "/r?email=[EMAIL]&phone=[TELEPHONE]",
    );
  });

  it.each(["email[]", "email%5B%5D", "contact.email", "contact[email]"])(
    "décode les valeurs de la clé %s",
    async (key) => {
      expect(await clean(`/r?${key}=prenom+alias%40example.org&ids=12+34+56`)).toBe(
        `/r?${key}=[EMAIL]&ids=12+34+56`,
      );
    },
  );

  it("conserve la protection d'une URL absolue entière malgré un espace encodé", async () => {
    expect(await clean("Lien : https://example.org/c?name=Romain%20Vuilleumier.")).toBe(
      "Lien : [URL].",
    );
  });

  it("garde les autres données d'une URL quand un ajout manuel en remplace une partie", async () => {
    const text = "https://example.org/c?name=Romain%20Vuilleumier&email=test%40example.org";
    const start = text.indexOf("Romain");
    const manual: Detection = {
      id: "manual",
      start,
      end: start + "Romain%20Vuilleumier".length,
      entityType: "PERSON",
      score: 1,
      recognizerId: "manual",
      packId: "manual",
      source: "manual",
      explanation: [],
    };
    const result = await analyzer.analyze(text, { manual: [manual] });
    expect(transform(text, result.detections, plan).text).toBe(
      "https://example.org/c?name=[PERSONNE]&email=[EMAIL]",
    );
  });

  it("projette aussi les sorties NER et les corrections manuelles sur l'original", async () => {
    const text = "😀 /r?email=romain%40example.org&name=Élodie%20Morel fin";
    const ner: NerEngine = {
      async load() {},
      async dispose() {},
      async recognize(view, ctx) {
        expect(view).toBe("😀 /r?email=romain@example.org&name=Élodie Morel fin");
        const start = view.indexOf("Élodie");
        return [
          {
            id: ctx.nextId(),
            start,
            end: start + 12,
            entityType: "PERSON",
            score: 0.99,
            recognizerId: "ner/test",
            packId: "ner",
            source: "ner",
            explanation: [],
          },
        ];
      },
    };
    const start = text.indexOf("romain");
    const manual: Detection = {
      id: "manual",
      start,
      end: start + "romain%40example.org".length,
      entityType: "PERSON",
      score: 1,
      recognizerId: "manual",
      packId: "manual",
      source: "manual",
      explanation: [],
    };
    const result = await analyzer.analyze(text, { ner, manual: [manual] });
    expect(transform(text, result.detections, plan).text).toBe(
      "😀 /r?email=[PERSONNE]&name=[PERSONNE] fin",
    );
    expect(result.detections.find((d) => d.id === "m1")).toMatchObject({ start, end: manual.end });
  });

  it("élargit une borne NER à tout un triplet malformé plutôt que d'en laisser un fragment", async () => {
    const text = "/c?x=%FF";
    const ner: NerEngine = {
      async load() {},
      async dispose() {},
      async recognize(view, ctx) {
        const start = view.indexOf("FF");
        return [
          {
            id: ctx.nextId(),
            start,
            end: start + 2,
            entityType: "PERSON",
            score: 1,
            recognizerId: "ner/test",
            packId: "ner",
            source: "ner",
            explanation: [],
          },
        ];
      },
    };
    const result = await analyzer.analyze(text, { ner });
    expect(transform(text, result.detections, plan).text).toBe("/c?x=[PERSONNE]");
  });

  it("une rognure autour d'un courriel ne peut pas couper le triplet qui le suit", async () => {
    const text = "/c?email=a%40example.org%20%46avre";
    const ner: NerEngine = {
      async load() {},
      async dispose() {},
      async recognize(view, ctx) {
        const start = view.indexOf("example");
        return [
          {
            id: ctx.nextId(),
            start,
            end: view.length,
            entityType: "PERSON",
            score: 0.99,
            recognizerId: "ner/test",
            packId: "ner",
            source: "ner",
            explanation: [],
          },
        ];
      },
    };
    const result = await analyzer.analyze(text, { ner });
    for (const d of [...result.detections, ...result.discarded]) {
      for (const triplet of text.matchAll(/%[\da-f]{2}/gi)) {
        expect(d.start > triplet.index && d.start < triplet.index + 3).toBe(false);
        expect(d.end > triplet.index && d.end < triplet.index + 3).toBe(false);
      }
    }
    expect(transform(text, result.detections, plan).text).not.toMatch(/%|20|46avre/);
  });
});
