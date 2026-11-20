/**
 * Propagation des noms avec les packs livrés : cas de test de Nico (courriel synthétique),
 * aller-retour analyse → pseudonymisation, propagation entre documents (knownPersons).
 * Noms inventés : aucune donnée réelle (R10).
 */
import { beforeAll, describe, expect, it } from "vitest";
import { bundledPackDirs, loadPackDir } from "../../../packs/_tools/load.ts";
import { PackRegistry } from "../registry/index.ts";
import { createSession } from "../mapping/index.ts";
import { transform } from "../transform/index.ts";
import type { Detection, Session, TransformPlan } from "../types/index.ts";
import { createAnalyzer, type Analyzer } from "./analyzer.ts";

const pseudo: TransformPlan = { mode: "pseudonymization", defaultOperator: "pseudonymize" };

let analyzer: Analyzer;

beforeAll(() => {
  const registry = new PackRegistry();
  for (const dir of bundledPackDirs()) registry.register(loadPackDir(dir));
  analyzer = createAnalyzer(registry.activeRules());
});

/** Mots qui ne doivent plus apparaître dans le texte transformé. */
const FORBIDDEN =
  /(?<![\p{L}\p{N}])(?:claire|martin|[ée]lodie|morel|jean-pierre|lambert|sophie|durand|paul|girard|nicolas|favre|cmartin|emorel|jplambert)(?![\p{L}\p{N}])/giu;

function pseudonymOf(
  text: string,
  detections: Detection[],
  session: Session,
  value: string,
  from = 0,
) {
  const start = text.indexOf(value, from);
  const d = detections.find((x) => x.start === start && x.end === start + value.length);
  if (!d) return undefined;
  return transform(text, [d], pseudo, session).text.slice(
    start,
    -(text.length - d.end) || undefined,
  );
}

const EMAIL = `De : Claire Martin <claire.martin@exemple.test>
À : Sophie Durand, Paul Girard
Cc : Élodie Morel, Jean-Pierre Lambert, Nicolas Favre
Objet : Comptes de connexion

Bonjour Sophie,

Merci à Paul et à Nicolas pour leur aide. Élodie confirme que Jean-Pierre n'a pas
encore reçu son mot de passe. Les comptes créés sont CMARTIN, EMOREL et JPLAMBERT
(identifiants : cmartin / emorel / jplambert).

Bonjour Paul, bonjour Nicolas,

Cordialement,
Claire
`;

describe("propagation avec les packs livrés", () => {
  it("cas de Nico : plus aucun nom ni identifiant en clair après pseudonymisation", async () => {
    const result = await analyzer.analyze(EMAIL, { language: "fr" });
    const out = transform(EMAIL, result.detections, pseudo, createSession());
    expect(out.errors).toEqual([]);
    expect(out.text.match(FORBIDDEN)).toBeNull();
    // Les deux identifiants minuscules et majuscules sont pris.
    expect(out.text).not.toMatch(/cmartin|emorel|jplambert/iu);
  });

  it("cas de Nico : aussi en masquage et sans filtre de langue", async () => {
    const result = await analyzer.analyze(EMAIL);
    const out = transform(EMAIL, result.detections, {
      mode: "masking",
      defaultOperator: "categorize",
    });
    expect(out.text.match(FORBIDDEN)).toBeNull();
  });

  it("aller-retour : « Sophie Durand … Sophie » reçoit le même pseudonyme", async () => {
    const text = "Sophie Durand a répondu. Merci à Sophie pour son aide.";
    const result = await analyzer.analyze(text, { language: "fr" });
    const session = createSession();
    const out = transform(text, result.detections, pseudo, session);
    expect(out.text).toBe("PERSONNE_001 a répondu. Merci à PERSONNE_001 pour son aide.");
    expect(session.entities().filter((e) => e.entityType === "PERSON")).toHaveLength(1);
  });

  it("l'identifiant dérivé (CMARTIN) rejoint la personne correspondante (#13)", async () => {
    const text = "Claire Martin a le compte CMARTIN.";
    const result = await analyzer.analyze(text, { language: "fr" });
    const session = createSession();
    const out = transform(text, result.detections, pseudo, session);
    expect(out.text).toBe("PERSONNE_001 a le compte PERSONNE_001.");
    expect(session.entities()).toHaveLength(1);
    expect(session.entities()[0]?.needsReview).toBe(true);
    expect(out.text).not.toMatch(/cmartin/iu);
  });

  it("un prénom cité AVANT le nom complet reçoit le même pseudonyme", async () => {
    // transform résout d'abord les noms complets, puis les formes partielles.
    const text = "Bonjour Sophie, voici le dossier de Sophie Durand.";
    const result = await analyzer.analyze(text, { language: "fr" });
    const out = transform(text, result.detections, pseudo, createSession());
    expect(out.text).toBe("Bonjour PERSONNE_001, voici le dossier de PERSONNE_001.");
  });

  it("prénom ambigu (« Rose ») : propagé depuis le nom complet, avec majuscule, hors début de phrase", async () => {
    const text =
      "Madame Rose Girard est venue. Plus tard, Rose est partie ; la rose est rouge. Rose fanée.";
    const result = await analyzer.analyze(text, { language: "fr" });
    const values = result.detections.map((d) => text.slice(d.start, d.end));
    expect(values).toContain("Rose Girard");
    // « Plus tard, Rose » : oui ; « la rose » (minuscule) et « . Rose fanée » (début de phrase) : non.
    expect(values.filter((v) => v === "Rose")).toHaveLength(1);
    const rose = result.detections.find((d) => text.slice(d.start, d.end) === "Rose");
    expect(rose?.start).toBe(text.indexOf("Rose est partie"));
  });

  it("prénom ambigu non propagé sans nom complet dans le texte", async () => {
    const text = "Plus tard, Rose est partie.";
    const result = await analyzer.analyze(text, { language: "fr" });
    expect(result.detections.some((d) => d.recognizerId === "core/name-propagation")).toBe(false);
  });

  it("ambigus fournis par l'appelant : pas propagés en début de phrase", async () => {
    const text = "Madame Alice Girard est venue. Alice est partie.";
    const base = await analyzer.analyze(text, { language: "fr" });
    expect(base.detections.map((d) => text.slice(d.start, d.end))).toContain("Alice");
    const guarded = await analyzer.analyze(text, {
      language: "fr",
      ambiguousGivenNames: new Set(["alice"]),
    });
    expect(guarded.detections.some((d) => d.recognizerId === "core/name-propagation")).toBe(false);
  });

  it("knownPersons : propage d'un document à l'autre avec les mêmes pseudonymes", async () => {
    const session = createSession();
    const doc1 = "Sophie Durand et Claire Martin (CMARTIN) ont validé.";
    const r1 = await analyzer.analyze(doc1, { language: "fr" });
    const t1 = transform(doc1, r1.detections, pseudo, session);
    expect(t1.text).toMatch(/^PERSONNE_001 et PERSONNE_002 \(/u);

    const known = session
      .entities()
      .filter((e) => e.entityType === "PERSON")
      .flatMap((e) => e.surfaceForms);
    const doc2 =
      "Merci pour votre retour. Sophie confirmera, EMOREL aussi ; cmartin reste en copie.";
    const without = await analyzer.analyze(doc2, { language: "fr" });
    expect(without.detections.some((d) => doc2.slice(d.start, d.end) === "Sophie")).toBe(false);

    const r2 = await analyzer.analyze(doc2, { language: "fr", knownPersons: known });
    const values = r2.detections.map((d) => doc2.slice(d.start, d.end));
    expect(values).toContain("Sophie");
    expect(values).toContain("cmartin");
    // « EMOREL » n'est connu d'aucune personne de la session : reste en clair (aucune invention).
    expect(values).not.toContain("EMOREL");
    // Même entité que dans le premier document : même pseudonyme.
    expect(pseudonymOf(doc2, r2.detections, session, "Sophie")).toBe("PERSONNE_001");
    expect(pseudonymOf(doc2, r2.detections, session, "cmartin")).toBe("PERSONNE_002");
  });
});
