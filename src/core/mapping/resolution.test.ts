import { describe, expect, it } from "vitest";
import { createSession } from "./session.ts";
import { normalizeForm } from "./resolution.ts";

function ids(forms: string[], type: "PERSON" | "ORGANIZATION" | "LOCATION" = "PERSON") {
  const s = createSession();
  return { s, ids: forms.map((f) => s.resolve(f, type).id) };
}

describe("normalizeForm", () => {
  it("normalise casse, accents, espaces, ponctuation et titres", () => {
    expect(normalizeForm("  Mme   Élodie  Brun. ", "PERSON")).toBe("elodie brun");
    expect(normalizeForm("Dr. Brun", "PERSON")).toBe("brun");
    expect(normalizeForm("Maître Brun,", "PERSON")).toBe("brun");
    expect(normalizeForm("Professeur Madame Brun", "PERSON")).toBe("brun");
    expect(normalizeForm("Mr Brun", "PERSON")).toBe("brun");
    expect(normalizeForm("Ms Brun", "PERSON")).toBe("brun");
  });
  it("garde un titre isolé", () => {
    expect(normalizeForm("Docteur", "PERSON")).toBe("docteur");
  });
  it("normalise légèrement les autres types", () => {
    expect(normalizeForm(" Jo@Exemple.TEST ", "EMAIL")).toBe("jo@exemple.test");
    expect(normalizeForm("xx00 1111 2222", "IBAN")).toBe("XX0011112222");
    expect(normalizeForm("+00 11 222 33 44", "PHONE")).toBe("+00112223344");
    expect(normalizeForm("111.2222.3333.44", "CH_AVS")).toBe(
      normalizeForm("111 2222 3333 44", "CH_AVS"),
    );
    expect(normalizeForm("AbC  def", "SECRET")).toBe("AbC def");
  });
});

describe("résolution des personnes", () => {
  it("rattache les variantes d'une même personne à une seule entité", () => {
    const { s, ids: r } = ids([
      "Claire Martin",
      "Mme Martin",
      "Claire",
      "C. Martin",
      "CLAIRE MARTIN",
      "Mme Claire Martin",
    ]);
    expect(new Set(r).size).toBe(1);
    const [e] = s.entities();
    expect(s.entities()).toHaveLength(1);
    expect(e?.needsReview).toBe(true);
    expect(e?.pseudonym).toBe("PERSONNE_001");
  });

  it("ne marque pas needsReview quand seules des formes identiques sont rencontrées", () => {
    const { s } = ids(["Claire Martin", "CLAIRE MARTIN", "Mme Claire Martin", "claire  martin."]);
    expect(s.entities()).toHaveLength(1);
    expect(s.entities()[0]?.needsReview).toBe(false);
  });

  it("garde les prénoms différents de même nom séparés, sans revue", () => {
    const { s } = ids(["Paul Martin", "Claire Martin"]);
    expect(s.entities().map((e) => e.needsReview)).toEqual([false, false]);
    expect(s.entities()).toHaveLength(2);
  });

  it("crée une nouvelle entité à vérifier pour un nom partagé par deux entités", () => {
    const { s, ids: r } = ids(["Paul Martin", "Claire Martin", "Martin"]);
    expect(new Set(r).size).toBe(3);
    const third = s.entities()[2];
    expect(third?.needsReview).toBe(true);
    expect(third?.pseudonym).toBe("PERSONNE_003");
    // La forme ambiguë suivante retombe sur cette même entité.
    expect(s.resolve("Martin", "PERSON").id).toBe(third?.id);
    expect(s.resolve("M. Martin", "PERSON").id).toBe(third?.id);
  });

  it("gère les homonymes exacts comme une seule entité", () => {
    const { s } = ids(["Paul Martin", "Paul Martin"]);
    expect(s.entities()).toHaveLength(1);
  });

  it("rattache un prénom ou un nom seul à l'unique entité connue", () => {
    const s = createSession();
    const a = s.resolve("Claire Martin", "PERSON");
    expect(s.resolve("Martin", "PERSON").id).toBe(a.id);
    expect(s.entities()[0]?.needsReview).toBe(true);
    const b = s.resolve("Paul Durand", "PERSON");
    expect(s.resolve("Paul", "PERSON").id).toBe(b.id);
  });

  it("ne rattache pas un prénom correspondant à deux entités", () => {
    const s = createSession();
    s.resolve("Claire Martin", "PERSON");
    s.resolve("Claire Durand", "PERSON");
    const c = s.resolve("Claire", "PERSON");
    expect(c.pseudonym).toBe("PERSONNE_003");
    expect(c.needsReview).toBe(true);
  });

  it("traite « C. Martin » : une initiale, un seul candidat", () => {
    const s = createSession();
    const a = s.resolve("Claire Martin", "PERSON");
    s.resolve("Paul Martin", "PERSON");
    expect(s.resolve("C. Martin", "PERSON").id).toBe(a.id);
    expect(s.entities()).toHaveLength(2);
    expect(s.entities()[0]?.needsReview).toBe(true);
    expect(s.entities()[1]?.needsReview).toBe(false);
  });

  it("traite « C. Martin » : initiale ambiguë ou inconnue", () => {
    const s = createSession();
    s.resolve("Claire Martin", "PERSON");
    s.resolve("Camille Martin", "PERSON");
    const amb = s.resolve("C. Martin", "PERSON");
    expect(amb.needsReview).toBe(true);
    expect(amb.pseudonym).toBe("PERSONNE_003");
    const unknown = s.resolve("P. Martin", "PERSON");
    expect(unknown.needsReview).toBe(false);
    expect(unknown.pseudonym).toBe("PERSONNE_004");
  });

  it("gère noms composés et particules", () => {
    const s = createSession();
    const a = s.resolve("Jean-Pierre de La Tour", "PERSON");
    expect(s.resolve("de La Tour", "PERSON").id).toBe(a.id);
    expect(s.resolve("La Tour", "PERSON").id).toBe(a.id);
    expect(s.resolve("Tour", "PERSON").id).toBe(a.id);
    expect(s.resolve("M. de la Tour", "PERSON").id).toBe(a.id);
    expect(s.resolve("Jean-Pierre", "PERSON").id).toBe(a.id);
    expect(s.resolve("J. de la Tour", "PERSON").id).toBe(a.id);
    expect(s.entities()).toHaveLength(1);
    // limite documentée : « Jean » seul n'est pas rattaché à « Jean-Pierre ».
    expect(s.resolve("Jean", "PERSON").id).not.toBe(a.id);
  });

  it("gère l'apostrophe typographique et les accents", () => {
    const s = createSession();
    const a = s.resolve("Éloïse d’Aubigné", "PERSON");
    expect(s.resolve("D'AUBIGNE", "PERSON").id).toBe(a.id);
    expect(s.resolve("eloise d'aubigne", "PERSON").id).toBe(a.id);
  });

  it("distingue deux familles à particules", () => {
    const s = createSession();
    const a = s.resolve("Anne de La Tour", "PERSON");
    const b = s.resolve("Marc Tour", "PERSON");
    const c = s.resolve("La Tour", "PERSON");
    expect(c.id).not.toBe(a.id);
    expect(c.id).not.toBe(b.id);
    expect(c.needsReview).toBe(true);
  });

  it("refuse une forme vide", () => {
    expect(() => createSession().resolve("  ", "PERSON")).toThrow();
    expect(() => createSession().resolve("...", "PERSON")).toThrow();
  });
});

describe("autres types", () => {
  it("organisations et lieux : correspondance après normalisation uniquement", () => {
    const o = ids(["Société Alpha SA", "SOCIETE ALPHA SA.", "Alpha"], "ORGANIZATION");
    expect(o.ids[0]).toBe(o.ids[1]);
    expect(o.ids[2]).not.toBe(o.ids[0]);
    const l = ids(["Genève", "geneve", "Mme Genève"], "LOCATION");
    expect(l.ids[0]).toBe(l.ids[1]);
    expect(l.ids[2]).not.toBe(l.ids[0]);
  });

  it("courriel, IBAN, téléphone, AVS", () => {
    const s = createSession();
    expect(s.resolve("Jo@Exemple.test", "EMAIL").id).toBe(s.resolve("jo@exemple.TEST", "EMAIL").id);
    expect(s.resolve("XX00 1111 2222", "IBAN").id).toBe(s.resolve("XX0011112222", "IBAN").id);
    expect(s.resolve("+00 11 222 33 44", "PHONE").id).toBe(s.resolve("+00112223344", "PHONE").id);
    expect(s.resolve("111.2222.3333.44", "CH_AVS").id).toBe(
      s.resolve("111 2222 3333 44", "CH_AVS").id,
    );
    expect(s.resolve("Abc", "SECRET").id).not.toBe(s.resolve("abc", "SECRET").id);
    expect(s.resolve("a@b.test", "EMAIL").pseudonym).toBe("EMAIL_002");
  });

  it("ne mélange pas les types", () => {
    const s = createSession();
    const p = s.resolve("Alpha", "PERSON");
    const o = s.resolve("Alpha", "ORGANIZATION");
    expect(p.id).not.toBe(o.id);
    expect(o.pseudonym).toBe("ORGANISATION_001");
  });
});
