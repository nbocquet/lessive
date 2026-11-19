/** Noms et adresses fictifs : destinataires de courriels avec noms absents des listes. */
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createAnalyzer, createSession, PackRegistry, transform } from "../../src/core/index.ts";
import type { NerEngine } from "../../src/core/types/index.ts";
import { bundledPackDirs, loadPackDir } from "../../packs/_tools/load.ts";

const registry = new PackRegistry();
for (const dir of bundledPackDirs()) registry.register(loadPackDir(dir));
const analyzer = createAnalyzer(registry.activeRules());

const cases = [
  ["À : Varnelot Cédric (DSI) <cedric.varnelot@example.org>", "Varnelot Cédric"],
  [
    "À : Claire Martin (DSI) <claire@example.org>; Varnelot Cédric (DSI)\n<cedric.varnelot@example.org>",
    "Varnelot Cédric",
  ],
  ["Cc : Cédric Varnelot <cedric.varnelot@example.org>", "Cédric Varnelot"],
  ['From: "VARNELOT CÉDRIC" <cedric.varnelot@example.org>', "VARNELOT CÉDRIC"],
  [
    "To: Anne-Sophie Varnelot <anne@example.org>, Cédric D’Azuro <cedric@example.org>",
    "Cédric D’Azuro",
  ],
] as const;

describe("destinataires : noms d'affichage sans NER", () => {
  it("garde le nom entier même si le modèle ne trouve que le prénom", async () => {
    const text = "À : Varnelot Cédric (DSI) <cedric.varnelot@example.org>";
    const ner: NerEngine = {
      load: async () => {},
      dispose: async () => {},
      recognize: async (source, ctx) => [
        {
          id: ctx.nextId(),
          start: source.indexOf("Cédric"),
          end: source.indexOf("Cédric") + "Cédric".length,
          entityType: "PERSON",
          score: 0.99,
          recognizerId: "ner/fictif",
          packId: "ner",
          source: "ner",
          explanation: [],
        },
      ],
    };
    const result = await analyzer.analyze(text, { language: "fr", ner });
    const names = result.detections.filter((d) => d.entityType === "PERSON");
    expect(names.map((d) => text.slice(d.start, d.end))).toEqual(["Varnelot Cédric"]);
  });

  it.each(cases)("protège le nom complet dans %s", async (text, name) => {
    const source = `😀 Message transféré\n${text}\nObjet : Incident\n\nTexte du message.`;
    const result = await analyzer.analyze(source, { language: "fr" });
    const detection = result.detections.find((d) => source.slice(d.start, d.end) === name);
    expect(detection?.entityType).toBe("PERSON");
    for (const mode of ["masking", "pseudonymization"] as const) {
      const output = transform(
        source,
        result.detections,
        {
          mode,
          defaultOperator: mode === "masking" ? "categorize" : "pseudonymize",
        },
        createSession(),
      );
      expect(output.errors).toEqual([]);
      expect(output.text).not.toContain(name);
      expect(output.text).not.toContain("@example.org");
      expect(output.text).toContain("Objet : Incident");
      if (source.includes("(DSI)")) expect(output.text).toContain("(DSI)");
    }
  });

  it("propage le nom rare depuis le destinataire vers le corps du message", async () => {
    const text =
      "À : Varnelot Cédric (DSI) <cedric.varnelot@example.org>\n\nVarnelot confirme. Merci Cédric.";
    const result = await analyzer.analyze(text, { language: "fr" });
    const output = transform(
      text,
      result.detections,
      { mode: "pseudonymization", defaultOperator: "pseudonymize" },
      createSession(),
    );
    expect(output.errors).toEqual([]);
    expect(output.text).not.toMatch(/Varnelot|Cédric/iu);
  });

  it.each([
    "À : Support <support@example.org>",
    "Objet : Notification affectation incidents\nBonjour, merci pour votre aide.",
    "À : Varnelot Cédric (DSI)\nObjet : Incident <incident@example.org>",
  ])("ne prend pas un objet ou une boîte sans nom complet pour une personne : %s", async (text) => {
    const result = await analyzer.analyze(text, { language: "fr" });
    expect(
      result.detections.filter((d) => d.recognizerId.endsWith("/courriel-nom-affiche")),
    ).toEqual([]);
  });
});

const MODEL = fileURLToPath(new URL("../../models/", import.meta.url));
const hasModel = existsSync(
  `${MODEL}Xenova/distilbert-base-multilingual-cased-ner-hrl/onnx/model_quantized.onnx`,
);

describe("destinataires : adresses entières protégées avec le vrai NER (#8)", () => {
  it.skipIf(!hasModel)(
    "aucun fragment de nom ne découpe l'adresse, dans les deux modes",
    async () => {
      const { TransformersNerEngine } = await import("../../src/ner/transformers-engine.ts");
      const ner = new TransformersNerEngine({ localModelPath: MODEL, device: "cpu" });
      await ner.load();
      try {
        const emails = [
          "elodie.morel@example.org",
          "nina.brumelac@example.org",
          "elise.delavarenque@example.org",
        ];
        const text = [
          "Élodie Morel <elodie.morel@example.org>",
          `Contact local : ${emails[0]}`,
          `gpt-3 : <${emails[1]}>`,
          `Cas 3 : <${emails[2]}>`,
        ].join("\n");
        const result = await analyzer.analyze(text, { language: "fr", ner });
        const found = result.detections
          .filter((d) => d.entityType === "EMAIL")
          .map((d) => text.slice(d.start, d.end));
        expect(found).toEqual([emails[0], emails[0], emails[1], emails[2]]);
        for (const mode of ["masking", "pseudonymization"] as const) {
          const output = transform(
            text,
            result.detections,
            { mode, defaultOperator: mode === "masking" ? "categorize" : "pseudonymize" },
            createSession(),
          );
          expect(output.errors).toEqual([]);
          expect(output.text).not.toMatch(/example|\.morel|brumelac|varenque/u);
          expect(output.text).not.toMatch(/PERSONNE_\d{3}[.@]\w|\w\.PERSONNE_\d{3}/u);
        }
      } finally {
        await ner.dispose();
      }
    },
    120_000,
  );
});
