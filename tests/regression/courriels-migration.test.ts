/**
 * Non-régression : fil de six courriels fictifs fourni par Nico (17 novembre 2026), sur lequel
 * un premier test avait laissé en clair des prénoms seuls, des identifiants de connexion
 * (CMARTIN…) et une adresse privée. Le nom réel de Nico y est remplacé par « Nicolas Ferrière ».
 *
 * Après analyse et pseudonymisation, aucune valeur personnelle ne doit rester en clair.
 * Hors champ, par décision documentée (docs/historique/PLAN.md §10) : les références internes (dossier, commande,
 * contrat, serveur) et les données sensibles (« raisons médicales »). « Établissement des
 * Tilleuls » n'est pas reconnu par le modèle NER (limite documentée).
 */
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  createAnalyzer,
  createSession,
  PackRegistry,
  transform,
  type NerEngine,
} from "../../src/core/index.ts";
import { bundledPackDirs, loadPackDir } from "../../packs/_tools/load.ts";

const TEXT = readFileSync(new URL("./fixtures/courriels-migration.md", import.meta.url), "utf8");

/** Valeurs qui ne doivent jamais rester en clair, même sans NER. */
const ALWAYS = [
  // Personnes : noms complets, prénoms seuls, noms seuls
  "Claire",
  "Martin",
  "Nicolas",
  "Ferrière",
  "Paul",
  "Dupont",
  "Sophie",
  "Bernard",
  "Élodie",
  "Morel",
  "Jean-Pierre",
  "Lambert",
  // Identifiants de connexion dérivés des noms
  "CMARTIN",
  "EMOREL",
  "JPLAMBERT",
  // Courriels
  "claire.martin@example.org",
  "n.ferriere@example.com",
  "paul.dupont@example.fr",
  "sophie.bernard@example.fr",
  "elodie.morel@example.org",
  // Téléphones
  "+41 79 234 56 78",
  "+41 22 345 67 89",
  "+33 6 12 34 56 78",
  "+41 78 345 67 90",
  "+33 4 72 11 22 33",
  "+33 6 98 76 54 32",
  // Adresses
  "18 rue des Mélèzes",
  "1205 Genève",
  "42 avenue des Acacias",
  "1227 Carouge",
  "25 rue de la République",
  "69002 Lyon",
  "7 avenue du Léman",
  "74100 Annemasse",
  // Identifiants techniques et d'entreprise
  "CHE-123.456.789",
  "192.168.10.15",
];

/** Valeurs reconnues seulement par le NER (organisations). */
const WITH_NER = ["Alpina Solutions", "HexaTech Conseil"];

/** Hors champ par décision : restent en clair, sans que ce soit une fuite. */
const OUT_OF_SCOPE = ["ET-2026-003821", "PO-2026-77841", "CT-2026-0847", "raisons médicales"];

function analyzer() {
  const reg = new PackRegistry();
  for (const dir of bundledPackDirs()) reg.register(loadPackDir(dir));
  return createAnalyzer(reg.activeRules());
}

async function pseudonymize(ner?: NerEngine): Promise<string> {
  const res = await analyzer().analyze(TEXT, { language: "fr", ...(ner ? { ner } : {}) });
  return transform(
    TEXT,
    res.detections,
    { mode: "pseudonymization", defaultOperator: "pseudonymize" },
    createSession(),
  ).text;
}

const leaks = (out: string, values: readonly string[]) => values.filter((v) => out.includes(v));

describe("non-régression : courriels de migration", () => {
  it("règles seules : aucune donnée personnelle en clair", async () => {
    const out = await pseudonymize();
    expect(leaks(out, ALWAYS)).toEqual([]);
  });

  it("une même personne garde un seul pseudonyme (« Bonjour Claire » et « Claire Martin »)", async () => {
    const out = await pseudonymize();
    // Courriel 1 : « De : Claire Martin » ; courriel 2 : « Bonjour Claire, Merci pour ces informations ».
    const fullName = /\*\*De :\*\* (PERSONNE_\d{3}) </u.exec(out)?.[1];
    const salutation = /Bonjour (PERSONNE_\d{3}),\n\nMerci pour ces informations/u.exec(out)?.[1];
    expect(fullName).toBeDefined();
    expect(salutation).toBe(fullName);
  });

  it("les éléments hors champ restent en clair (décision documentée)", async () => {
    const out = await pseudonymize();
    expect(leaks(out, OUT_OF_SCOPE)).toEqual(OUT_OF_SCOPE);
  });

  const MODEL = "/mnt/user-data/uploads/lessive/models/";
  const hasModel = existsSync(
    `${MODEL}Xenova/distilbert-base-multilingual-cased-ner-hrl/onnx/model_quantized.onnx`,
  );
  it.skipIf(!hasModel)(
    "avec le NER : organisations remplacées aussi",
    async () => {
      const { TransformersNerEngine } = await import("../../src/ner/transformers-engine.ts");
      const ner = new TransformersNerEngine({ localModelPath: MODEL, device: "cpu" });
      await ner.load();
      try {
        const out = await pseudonymize(ner);
        expect(leaks(out, [...ALWAYS, ...WITH_NER])).toEqual([]);
      } finally {
        await ner.dispose();
      }
    },
    120_000,
  );

  // Modèle CamemBERT-NER déposé dans models/ (non versionné) : test sauté en son absence.
  const LOCAL_MODELS = fileURLToPath(new URL("../../models/", import.meta.url));
  const CAMEMBERT = "Xenova/camembert-ner";
  const hasCamembert = existsSync(`${LOCAL_MODELS}${CAMEMBERT}/onnx/model_quantized.onnx`);
  it.skipIf(!hasCamembert)(
    "avec CamemBERT : ni jeton au milieu d'un mot, ni personne à cheval sur un paragraphe",
    async () => {
      const { TransformersNerEngine } = await import("../../src/ner/transformers-engine.ts");
      const ner = new TransformersNerEngine({
        modelId: CAMEMBERT,
        localModelPath: LOCAL_MODELS,
        device: "cpu",
      });
      await ner.load();
      try {
        const res = await analyzer().analyze(TEXT, { language: "fr", ner });
        const out = transform(
          TEXT,
          res.detections,
          { mode: "pseudonymization", defaultOperator: "pseudonymize" },
          createSession(),
        ).text;
        // Libellé intact : « Objet » n'est pas coupé par un repère.
        expect(out).toContain("**Objet :**");
        expect(out).not.toMatch(/[\p{L}]\w*(?:PERSONNE|LIEU|ORGANISATION)_\d{3}/u);
        expect(out).not.toMatch(/(?:PERSONNE|LIEU|ORGANISATION)_\d{3}\p{L}/u);
        // Aucune entité PERSON ne traverse une ligne vide.
        for (const d of res.detections) {
          if (d.entityType === "PERSON") {
            expect(TEXT.slice(d.start, d.end)).not.toMatch(/\n\s*\n/u);
          }
        }
      } finally {
        await ner.dispose();
      }
    },
    120_000,
  );
});
