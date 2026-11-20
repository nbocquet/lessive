import { describe, expect, it, vi } from "vitest";
import type { AnalysisContext, Detection } from "../types/index.ts";
import {
  createPersonNamePropagator,
  PROPAGATED_GIVEN_NAME_SCORE,
  PROPAGATED_NAME_SCORE,
  PROPAGATION_RECOGNIZER_ID,
  propagatePersonNames,
  type PropagateOptions,
} from "./propagate-names.ts";

function makeCtx(): AnalysisContext {
  let n = 0;
  return { nextId: () => `p${++n}` };
}

/** Détection sur la première occurrence de `value` à partir de `from`. */
function det(text: string, value: string, over: Partial<Detection> = {}, from = 0): Detection {
  const start = text.indexOf(value, from);
  if (start < 0) throw new Error("valeur introuvable dans le texte de test");
  return {
    id: `s${start}`,
    start,
    end: start + value.length,
    entityType: "PERSON",
    score: 0.8,
    recognizerId: "lang-fr-en/prenoms",
    packId: "lang-fr-en",
    source: "dictionary",
    explanation: ["test"],
    ...over,
  };
}

function run(
  text: string,
  detections: Detection[],
  options: Partial<PropagateOptions> = {},
): string[] {
  const out = propagatePersonNames(text, detections, makeCtx(), { minScore: 0.5, ...options });
  return out.map((d) => text.slice(d.start, d.end));
}

describe("propagatePersonNames : formes dérivées", () => {
  const base = "Claire Martin est là. ";

  it.each([
    "CMARTIN",
    "cmartin",
    "Claire",
    "Martin",
    "claire.martin",
    "claire_martin",
    "claire-martin",
    "c.martin",
    "martin.claire",
    "martinc",
    "clairemartin",
    "Martin Claire",
  ])("trouve la forme « %s »", (form) => {
    const text = `${base}Voir : ${form} demain.`;
    expect(run(text, [det(text, "Claire Martin")])).toEqual([form]);
  });

  it("donne le score 0,85 à un nom ou un identifiant et 0,75 à un prénom seul", () => {
    const text = `${base}Claire puis Martin puis CMARTIN.`;
    const out = propagatePersonNames(text, [det(text, "Claire Martin")], makeCtx(), {
      minScore: 0.5,
    });
    const byValue = Object.fromEntries(out.map((d) => [text.slice(d.start, d.end), d.score]));
    expect(byValue).toEqual({
      Claire: PROPAGATED_GIVEN_NAME_SCORE,
      Martin: PROPAGATED_NAME_SCORE,
      CMARTIN: PROPAGATED_NAME_SCORE,
    });
    for (const d of out) {
      expect(d).toMatchObject({
        entityType: "PERSON",
        source: "dictionary",
        recognizerId: PROPAGATION_RECOGNIZER_ID,
        packId: "core",
      });
    }
  });

  it("respecte les limites de mots pour les identifiants", () => {
    const bad = [
      "cmartins",
      "xcmartin",
      "cmartin2",
      "cmartin.exemple.org",
      "x.cmartin",
      "cmartin_test",
      "a-cmartin",
      "cmartin-b",
    ];
    const text = `${base}${bad.join(" ; ")}`;
    expect(run(text, [det(text, "Claire Martin")])).toEqual([]);
    const good = "Compte : CMARTIN. Puis (cmartin), @cmartin, « cmartin » et - cmartin\n";
    const t2 = `${base}${good}`;
    expect(run(t2, [det(t2, "Claire Martin")])).toEqual([
      "CMARTIN",
      "cmartin",
      "cmartin",
      "cmartin",
      "cmartin",
    ]);
  });

  it("prend les parties d'identifiant seules mais pas dans un nom plus long", () => {
    const text = `${base}Martin-Favre et Claire-Anne ; Martins.`;
    expect(run(text, [det(text, "Claire Martin")])).toEqual([]);
  });
});

describe("propagatePersonNames : prénoms composés et particules", () => {
  it("garde le prénom composé entier, jamais « Jean » seul", () => {
    const text = "Jean-Pierre Lambert. Jean-Pierre, Jean, JPLAMBERT, jean-pierre.lambert, Lambert.";
    expect(run(text, [det(text, "Jean-Pierre Lambert")])).toEqual([
      "Jean-Pierre",
      "JPLAMBERT",
      "jean-pierre.lambert",
      "Lambert",
    ]);
  });

  it("couvre aussi les variantes sans tiret", () => {
    const text = "Jean-Pierre Lambert. jeanpierre.lambert et jeanpierrelambert";
    expect(run(text, [det(text, "Jean-Pierre Lambert")])).toEqual([
      "jeanpierre.lambert",
      "jeanpierrelambert",
    ]);
  });

  it("gère un nom à particule : « La Tour » et « de La Tour »", () => {
    const text = "Marc de La Tour. Puis La Tour, de La Tour, Tour, MDELATOUR, mlatour, Marc.";
    expect(run(text, [det(text, "Marc de La Tour")])).toEqual([
      "La Tour",
      "de La Tour",
      "MDELATOUR",
      "mlatour",
      "Marc",
    ]);
  });

  it("gère l'élision (d'Aubigné)", () => {
    const text = "Anne d'Aubigné. Puis d'Aubigné, Aubigné, adaubigne.";
    expect(run(text, [det(text, "Anne d'Aubigné")])).toEqual(["d'Aubigné", "Aubigné", "adaubigne"]);
  });
});

describe("propagatePersonNames : casse et accents", () => {
  it("ignore la casse et les accents pour les noms et les identifiants", () => {
    const text = "Élodie Morel. EMOREL, emorel, elodie.morel, élodie.morel, ELODIE, Elodie, MOREL.";
    expect(run(text, [det(text, "Élodie Morel")])).toEqual([
      "EMOREL",
      "emorel",
      "elodie.morel",
      "élodie.morel",
      "ELODIE",
      "Elodie",
      "MOREL",
    ]);
  });

  it("accepte un texte décomposé (NFD) avec des positions exactes", () => {
    const text = `Élodie Morel. Puis Élodie et élodie.morel.`;
    const out = propagatePersonNames(text, [det(text, "Élodie Morel")], makeCtx(), {
      minScore: 0.5,
    });
    expect(out.map((d) => text.slice(d.start, d.end))).toEqual(["Élodie", "élodie.morel"]);
  });

  it("exige une majuscule pour un prénom seul : « Paul » oui, « paul » non", () => {
    const text = "Paul Girard. Paul, paul, PAUL, girard.";
    expect(run(text, [det(text, "Paul Girard")])).toEqual(["Paul", "PAUL", "girard"]);
  });
});

describe("propagatePersonNames : ambigus", () => {
  it("ne propage pas seul un prénom ambigu (« Pierre »)", () => {
    const text = "Pierre Moulin. Pierre est là, pierre aussi. Moulin.";
    const out = run(text, [det(text, "Pierre Moulin")], {
      ambiguousGivenNames: new Set(["Pierre"]),
    });
    expect(out).toEqual(["Moulin"]);
  });

  it("un nom de famille ambigu exige la majuscule", () => {
    const text = "Paul Blanc. Blanc, blanc, BLANC et le blanc.";
    const out = run(text, [det(text, "Paul Blanc")], { ambiguousFamilyNames: new Set(["blanc"]) });
    expect(out).toEqual(["Blanc", "BLANC"]);
  });

  it("un nom de famille non ambigu n'exige pas la majuscule", () => {
    const text = "Paul Girard. girard.";
    expect(run(text, [det(text, "Paul Girard")])).toEqual(["girard"]);
  });
});

describe("propagatePersonNames : noms sûrs", () => {
  it("ignore un nom sous le seuil, un prénom isolé du dictionnaire et un autre type", () => {
    const text = "Sophie Durand. Sophie. Claire. Sophie.";
    expect(run(text, [det(text, "Sophie Durand", { score: 0.45 })])).toEqual([]);
    expect(run(text, [det(text, "Claire", { score: 0.8 })])).toEqual([]);
    expect(run(text, [det(text, "Sophie Durand", { entityType: "ORGANIZATION" })])).toEqual([]);
  });

  it("utilise le minScore de l'analyse", () => {
    const text = "Sophie Durand. Sophie.";
    const d = det(text, "Sophie Durand", { score: 0.8 });
    expect(run(text, [d], { minScore: 0.9 })).toEqual([]);
    expect(run(text, [d], { minScore: 0.8 })).toEqual(["Sophie"]);
  });

  it("titre + nom : propage le nom, sans prénom ni identifiant", () => {
    const text = "Mme Dupont est venue. Dupont, DUPONT, mdupont.";
    const d = det(text, "Dupont", { recognizerId: "lang-fr-en/titres-nom", score: 1 });
    expect(run(text, [d])).toEqual(["Dupont", "DUPONT"]);
  });

  it("reconnaît un titre juste avant la détection même sans identifiant de règle", () => {
    const text = "Dr Keller. Keller et Keller.";
    const d = det(text, "Keller", { recognizerId: "test/autre", source: "pattern", score: 0.9 });
    expect(run(text, [d])).toEqual(["Keller", "Keller"]);
  });

  it("NER d'un seul mot : sûr à partir de 0,8", () => {
    const text = "Camille a écrit. Camille.";
    const ner = (score: number) =>
      det(text, "Camille", { source: "ner", recognizerId: "ner/x", score });
    expect(run(text, [ner(0.79)])).toEqual([]);
    expect(run(text, [ner(0.8)])).toEqual(["Camille"]);
  });

  it("ajout manuel : toujours sûr, même sous le seuil", () => {
    const text = "Camille a écrit. Camille.";
    const d = det(text, "Camille", { source: "manual", score: 1 });
    expect(run(text, [d], { minScore: 0.95 })).toEqual(["Camille"]);
  });

  it("n'utilise pas un texte qui n'est pas un nom (chiffres, arobase)", () => {
    const text = "Agent 007 Bond. 007 et Bond.";
    expect(run(text, [det(text, "Agent 007 Bond")])).toEqual([]);
  });
});

describe("propagatePersonNames : knownPersons", () => {
  it("propage les formes connues d'avance dans un texte sans détection", () => {
    const text = "Bonjour Sophie, le compte CMARTIN et claire.martin sont créés. Claire Martin.";
    const out = run(text, [], { knownPersons: ["Sophie Durand", "Claire Martin", "CMARTIN"] });
    expect(out).toEqual(["Sophie", "CMARTIN", "claire.martin", "Claire Martin"]);
  });

  it("traite une forme connue avec titre comme un nom de famille", () => {
    const text = "Dupont, dupont, mdupont.";
    expect(run(text, [], { knownPersons: ["Mme Dupont"] })).toEqual(["Dupont", "dupont"]);
  });

  it("un mot connu tout en capitales (identifiant) est trouvé quelle que soit la casse", () => {
    const text = "Compte cmartin et Cmartin ; sophie, Sophie.";
    expect(run(text, [], { knownPersons: ["CMARTIN", "Sophie"] })).toEqual([
      "cmartin",
      "Cmartin",
      "Sophie",
    ]);
  });

  it("un prénom du dictionnaire après un titre n'est pas pris pour un nom de famille", () => {
    const text = "Mme Alice Girard. Alice, Girard.";
    const d = det(text, "Alice", { score: 0.8 });
    expect(run(text, [d])).toEqual([]);
  });

  it("respecte les prénoms ambigus pour une forme connue d'un seul mot", () => {
    const text = "Pierre est là.";
    expect(
      run(text, [], { knownPersons: ["Pierre"], ambiguousGivenNames: new Set(["pierre"]) }),
    ).toEqual([]);
    expect(run(text, [], { knownPersons: ["Pierre"] })).toEqual(["Pierre"]);
  });
});

describe("propagatePersonNames : doublons et conflits", () => {
  it("ne duplique pas une détection existante de la même personne", () => {
    const text = "Claire Martin. Bonjour Claire, CMARTIN.";
    const out = run(text, [
      det(text, "Claire Martin"),
      det(text, "Claire", { score: 0.8 }, 10),
      det(text, "CMARTIN", { source: "pattern", entityType: "SECRET", score: 0.9 }),
    ]);
    expect(out).toEqual([]);
  });

  it("ne produit rien dans une adresse courriel ou une URL déjà détectée", () => {
    const text = "Claire Martin : c.martin@exemple.test, https://x.test/cmartin, cmartin.";
    const email = det(text, "c.martin@exemple.test", {
      entityType: "EMAIL",
      score: 0.9,
      source: "pattern",
    });
    const url = det(text, "https://x.test/cmartin", {
      entityType: "URL",
      score: 0.9,
      source: "pattern",
    });
    expect(run(text, [det(text, "Claire Martin"), email, url])).toEqual(["cmartin"]);
  });

  it("une détection sous le seuil ne bloque pas la propagation", () => {
    const text = "Claire Martin. Claire.";
    expect(
      run(text, [det(text, "Claire Martin"), det(text, "Claire", { score: 0.45 }, 5)]),
    ).toEqual(["Claire"]);
  });

  it("ne recouvre pas un ajout manuel", () => {
    const text = "Claire Martin. Claire.";
    const manual = det(text, "Claire", { source: "manual", entityType: "LOCATION", score: 1 }, 5);
    expect(run(text, [det(text, "Claire Martin"), manual])).toEqual([]);
  });

  it("une même forme venant de deux noms ne donne qu'une détection", () => {
    const text = "Claire Martin et Paul Martin. Martin.";
    const out = propagatePersonNames(
      text,
      [det(text, "Claire Martin"), det(text, "Paul Martin")],
      makeCtx(),
      { minScore: 0.5 },
    );
    expect(out.map((d) => text.slice(d.start, d.end))).toEqual(["Martin"]);
  });
});

describe("propagatePersonNames : positions (R7) et explications (R5)", () => {
  it("donne des positions UTF-16 exactes après des émojis", () => {
    const text = "😀😀 Claire Martin 👨‍👩‍👧 puis 😀CMARTIN😀 et Claire.";
    const out = propagatePersonNames(text, [det(text, "Claire Martin")], makeCtx(), {
      minScore: 0.5,
    });
    expect(out.map((d) => text.slice(d.start, d.end))).toEqual(["CMARTIN", "Claire"]);
    for (const d of out) {
      expect(d.start).toBe(text.indexOf(text.slice(d.start, d.end), d.start));
    }
  });

  it("couvre un nom complet avec espaces insécables ou multiples", () => {
    const text = "Claire Martin. Ensuite claire\u00a0martin et CLAIRE   MARTIN.";
    expect(run(text, [det(text, "Claire Martin")])).toEqual([
      "claire\u00a0martin",
      "CLAIRE   MARTIN",
    ]);
  });

  it("ne franchit pas un retour à la ligne", () => {
    // Le nom complet « claire martin » n'est pas reconnu sur deux lignes ; « martin » seul l'est.
    const text = "Claire Martin. claire\nmartin";
    expect(run(text, [det(text, "Claire Martin")])).toEqual(["martin"]);
  });

  it("ne cite jamais le texte dans les explications", () => {
    const text = "Élodie Morel. Élodie, EMOREL, Morel.";
    const out = propagatePersonNames(text, [det(text, "Élodie Morel")], makeCtx(), {
      minScore: 0.5,
    });
    expect(out.length).toBe(3);
    for (const d of out) {
      const joined = d.explanation.join(" ").toLowerCase();
      for (const word of ["élodie", "elodie", "morel", "emorel"])
        expect(joined).not.toContain(word);
    }
    expect(out.map((d) => d.explanation[0])).toEqual([
      "forme d'un nom détecté ailleurs dans le texte",
      "identifiant dérivé d'un nom détecté",
      "forme d'un nom détecté ailleurs dans le texte",
    ]);
  });
});

describe("propagatePersonNames : performance", () => {
  it("traite 100 000 caractères et 200 noms sûrs en moins de 500 ms", () => {
    const firsts = ["Alice", "Bruno", "Chloé", "David", "Emma", "Fabien", "Gaëlle", "Hugo"];
    const lasts = ["Lemaire", "Dupuis", "Garnier", "Perrot", "Colin", "Masson", "Brun", "Leroy"];
    const names: string[] = [];
    for (let i = 0; i < 200; i++) {
      names.push(`${firsts[i % 8]} ${lasts[Math.floor(i / 8) % 8]}${"x".repeat(i % 25)}`);
    }
    const filler = "Le rapport mensuel du service est joint ; voir aussi alice.lemaire et BRUNO. ";
    let text = names.join(". ") + ". ";
    while (text.length < 100_000) text += filler;
    const detections = names.map((nm) => det(text, nm));
    const t0 = performance.now();
    const out = propagatePersonNames(text, detections, makeCtx(), { minScore: 0.5 });
    const elapsed = performance.now() - t0;
    expect(out.length).toBeGreaterThan(1000);
    expect(elapsed).toBeLessThan(500);
  });
});

describe("propagation sans personne", () => {
  it("ne parcourt pas les noms ambigus sans personne à propager", () => {
    const ambiguous = new Set(["Églantine"]);
    const iterate = vi.spyOn(ambiguous, Symbol.iterator);
    const text = "probe@example.org";
    expect(
      propagatePersonNames(text, [det(text, text, { entityType: "EMAIL" })], makeCtx(), {
        minScore: 0.5,
        knownPersons: [],
        ambiguousGivenNames: ambiguous,
        ambiguousFamilyNames: ambiguous,
      }),
    ).toEqual([]);
    expect(iterate).not.toHaveBeenCalled();
  });
});

describe("propagation préparée par analyseur", () => {
  it("réutilise les dictionnaires repliés avec les mêmes détections", () => {
    const given = new Set(["elodie"]);
    const family = new Set(["blanc"]);
    const iterateGiven = vi.spyOn(given, Symbol.iterator);
    const iterateFamily = vi.spyOn(family, Symbol.iterator);
    const propagate = createPersonNamePropagator({ given, family });
    for (const text of [
      "Élodie Blanc. Puis Élodie, blanc, Blanc et eblanc.",
      "😀 Élodie Blanc. Puis Élodie et BLANC.",
    ]) {
      const detections = [det(text, "Élodie Blanc")];
      const options = { minScore: 0.5 };
      expect(propagate(text, detections, makeCtx(), options)).toEqual(
        propagatePersonNames(text, detections, makeCtx(), {
          ...options,
          ambiguousGivenNames: new Set(["Élodie"]),
          ambiguousFamilyNames: new Set(["Blanc"]),
        }),
      );
    }
    expect(iterateGiven).not.toHaveBeenCalled();
    expect(iterateFamily).not.toHaveBeenCalled();
  });

  it("relit les ambigus supplémentaires sans les conserver entre analyses", () => {
    const propagate = createPersonNamePropagator({ given: new Set(), family: new Set() });
    const extra = new Set(["Élodie"]);
    const options = { minScore: 0.5, knownPersons: ["Élodie"], ambiguousGivenNames: extra };
    const text = "Bonjour Élodie.";
    expect(propagate(text, [], makeCtx(), options)).toEqual([]);
    extra.clear();
    expect(propagate(text, [], makeCtx(), options).map((d) => text.slice(d.start, d.end))).toEqual([
      "Élodie",
    ]);
    expect(propagate(text, [], makeCtx(), { minScore: 0.5 })).toEqual([]);
  });
});
