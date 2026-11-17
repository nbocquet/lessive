import { describe, expect, it } from "vitest";
import { createSession, reidentify } from "../../core/index.ts";
import { countLabel, prepareReidentifyPreview } from "./ReidPreview.ts";

function setup() {
  const session = createSession();
  const person = session.resolve("Alice Exemple", "PERSON");
  const org = session.resolve("Société Factice", "ORGANIZATION");
  return { session, person, org };
}

describe("prepareReidentifyPreview", () => {
  it("découpe le texte et marque les noms remis", () => {
    const { session, person, org } = setup();
    const text = `Bonjour ${person.pseudonym}, ${org.pseudonym} vous répond. ${person.pseudonym} aussi.`;
    const preview = prepareReidentifyPreview(reidentify(text, session));
    expect(preview.segments.map((s) => s.text).join("")).toBe(
      "Bonjour Alice Exemple, Société Factice vous répond. Alice Exemple aussi.",
    );
    const marked = preview.segments.filter((s) => s.pseudonym !== undefined);
    expect(marked.map((s) => s.text)).toEqual([
      "Alice Exemple",
      "Société Factice",
      "Alice Exemple",
    ]);
    expect(preview.replacedCount).toBe(3);
    expect(preview.entityCount).toBe(2);
    expect(preview.unknownCount).toBe(0);
    expect(preview.ambiguousCount).toBe(0);
  });

  it("regroupe les jetons inconnus par pseudonyme", () => {
    const { session, person } = setup();
    const text = `${person.pseudonym}, PERSONNE_099 puis PERSONNE_099 et LIEU_007.`;
    const preview = prepareReidentifyPreview(reidentify(text, session));
    expect(preview.replacedCount).toBe(1);
    expect(preview.unknownCount).toBe(3);
    expect(preview.unknown).toEqual([
      { pseudonym: "PERSONNE_099", occurrences: 2 },
      { pseudonym: "LIEU_007", occurrences: 1 },
    ]);
  });

  it("signale les jetons ambigus après une scission partielle", () => {
    const session = createSession();
    const a = session.resolve("Alice Exemple", "PERSON");
    const b = session.resolve("Bruno Factice", "PERSON");
    const c = session.resolve("Carole Demo", "PERSON");
    session.merge(b.id, c.id);
    session.merge(a.id, b.id);
    session.split(a.id, "Bruno Factice");
    const preview = prepareReidentifyPreview(reidentify(`${b.pseudonym} a écrit.`, session));
    expect(preview.ambiguousCount).toBe(1);
    expect(preview.ambiguous[0]?.pseudonym).toBe(b.pseudonym);
    expect(preview.replacedCount).toBe(0);
    expect(preview.segments.map((s) => s.text).join("")).toBe(`${b.pseudonym} a écrit.`);
  });

  it("renvoie un seul segment sans jeton, et aucun pour un texte vide", () => {
    const { session } = setup();
    expect(prepareReidentifyPreview(reidentify("Rien à remplacer.", session)).segments).toEqual([
      { text: "Rien à remplacer." },
    ]);
    expect(prepareReidentifyPreview(reidentify("", session)).segments).toEqual([]);
  });

  it("ne produit que des segments de texte (pas de balisage interprété)", () => {
    const { session, person } = setup();
    const text = `<img src=x onerror=alert(1)> ${person.pseudonym}`;
    const preview = prepareReidentifyPreview(reidentify(text, session));
    expect(preview.segments[0]?.text).toBe("<img src=x onerror=alert(1)> ");
  });
});

describe("countLabel", () => {
  it("accorde au singulier et au pluriel", () => {
    expect(countLabel(1, "jeton", "jetons")).toBe("1 jeton");
    expect(countLabel(0, "jeton", "jetons")).toBe("0 jetons");
    expect(countLabel(3, "jeton", "jetons")).toBe("3 jetons");
  });
});
