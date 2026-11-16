import { describe, expect, it } from "vitest";
import { createSession } from "./session.ts";
import { formatPseudonym } from "./pseudonym.ts";

describe("session en mémoire", () => {
  it("numérote par type dans l'ordre d'apparition, sur 3 chiffres", () => {
    const s = createSession({ id: "s1" });
    expect(s.id).toBe("s1");
    expect(s.resolve("Claire Martin", "PERSON").pseudonym).toBe("PERSONNE_001");
    expect(s.resolve("Paul Durand", "PERSON").pseudonym).toBe("PERSONNE_002");
    expect(s.resolve("Alpha SA", "ORGANIZATION").pseudonym).toBe("ORGANISATION_001");
    expect(s.resolve("Lausanne", "LOCATION").pseudonym).toBe("LIEU_001");
    expect(s.resolve("a@b.test", "EMAIL").pseudonym).toBe("EMAIL_001");
    expect(s.resolve("+00 11 222 33 44", "PHONE").pseudonym).toBe("TELEPHONE_001");
  });

  it("génère un identifiant par défaut distinct", () => {
    expect(createSession().id).not.toBe(createSession().id);
  });

  it("garde le format du pseudonyme dans une seule fonction", () => {
    expect(formatPseudonym("PERSON", 7)).toBe("PERSONNE_007");
    expect(formatPseudonym("CH_UID", 1234)).toBe("IDE_1234");
  });

  it("renvoie des copies qui ne modifient pas la session", () => {
    const s = createSession();
    const e = s.resolve("Claire Martin", "PERSON");
    e.surfaceForms.push("X");
    e.pseudonym = "FAUX";
    expect(s.entities()[0]?.surfaceForms).toEqual(["Claire Martin"]);
    expect(s.entities()[0]?.pseudonym).toBe("PERSONNE_001");
  });

  it("enregistre chaque forme rencontrée, sans doublon", () => {
    const s = createSession();
    s.resolve("Claire Martin", "PERSON");
    s.resolve("Mme Martin", "PERSON");
    s.resolve("Mme Martin", "PERSON");
    expect(s.entities()[0]?.surfaceForms).toEqual(["Claire Martin", "Mme Martin"]);
  });

  it("retrouve une entité par pseudonyme", () => {
    const s = createSession();
    const e = s.resolve("Claire Martin", "PERSON");
    expect(s.byPseudonym("PERSONNE_001")?.id).toBe(e.id);
    expect(s.byPseudonym("PERSONNE_002")).toBeUndefined();
  });

  describe("merge", () => {
    it("fusionne les formes et ne réutilise jamais un numéro", () => {
      const s = createSession();
      const a = s.resolve("Claire Martin", "PERSON");
      const b = s.resolve("Paul Durand", "PERSON");
      s.merge(a.id, b.id);
      expect(s.entities()).toHaveLength(1);
      expect(s.entities()[0]?.surfaceForms).toEqual(["Claire Martin", "Paul Durand"]);
      expect(s.resolve("Paul Durand", "PERSON").id).toBe(a.id);
      expect(s.resolve("Anne Petit", "PERSON").pseudonym).toBe("PERSONNE_003");
    });

    it("garde le pseudonyme de la source résolvable, y compris après fusions en chaîne", () => {
      const s = createSession();
      const a = s.resolve("Anne Un", "PERSON");
      const b = s.resolve("Bob Deux", "PERSON");
      const c = s.resolve("Cathy Trois", "PERSON");
      s.merge(b.id, c.id);
      s.merge(a.id, b.id);
      expect(s.byPseudonym("PERSONNE_002")?.id).toBe(a.id);
      expect(s.byPseudonym("PERSONNE_003")?.id).toBe(a.id);
    });

    it("confirme le regroupement (needsReview à faux) et refuse les cas invalides", () => {
      const s = createSession();
      const a = s.resolve("Claire Martin", "PERSON");
      const b = s.resolve("Paul Martin", "PERSON");
      s.resolve("Martin", "PERSON");
      s.merge(a.id, b.id);
      expect(s.entities()[0]?.needsReview).toBe(false);
      const o = s.resolve("Alpha", "ORGANIZATION");
      expect(() => s.merge(a.id, o.id)).toThrow();
      expect(() => s.merge(a.id, a.id)).toThrow();
      expect(() => s.merge(a.id, "inconnu")).toThrow();
    });
  });

  describe("split", () => {
    it("crée une nouvelle entité avec un nouveau numéro", () => {
      const s = createSession();
      const a = s.resolve("Claire Martin", "PERSON");
      s.resolve("Mme Martin", "PERSON");
      const n = s.split(a.id, "Mme Martin");
      expect(n.pseudonym).toBe("PERSONNE_002");
      expect(n.surfaceForms).toEqual(["Mme Martin"]);
      expect(n.needsReview).toBe(false);
      expect(s.entities()[0]?.surfaceForms).toEqual(["Claire Martin"]);
      // La forme détachée est désormais résolue vers la nouvelle entité.
      expect(s.resolve("Mme Martin", "PERSON").id).toBe(n.id);
    });

    it("refuse une forme inconnue ou la dernière forme", () => {
      const s = createSession();
      const a = s.resolve("Claire Martin", "PERSON");
      expect(() => s.split(a.id, "Autre")).toThrow();
      expect(() => s.split(a.id, "Claire Martin")).toThrow();
      expect(() => s.split("inconnu", "x")).toThrow();
    });

    it("ne réutilise pas un numéro après fusion puis scission", () => {
      const s = createSession();
      const a = s.resolve("Claire Martin", "PERSON");
      const b = s.resolve("Paul Durand", "PERSON");
      s.merge(a.id, b.id);
      expect(s.split(a.id, "Paul Durand").pseudonym).toBe("PERSONNE_003");
    });
  });

  it("n'expose jamais le texte original dans les messages d'erreur", () => {
    const s = createSession();
    const a = s.resolve("Claire Martin", "PERSON");
    for (const fn of [() => s.split(a.id, "Zoé Secret"), () => s.merge(a.id, "Zoé Secret")]) {
      try {
        fn();
      } catch (e) {
        expect(String(e)).not.toContain("Zoé");
      }
    }
  });
});
