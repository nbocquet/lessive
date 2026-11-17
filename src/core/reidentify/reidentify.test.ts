import { describe, expect, it } from "vitest";
import { createSession as createPublicSession, InMemorySession } from "../mapping/session.ts";
import { run } from "../mapping/test-helpers.ts";
import { buildPromptNotice } from "./notice.ts";
import { reidentify } from "./reidentify.ts";
import { findTokens } from "./tokens.ts";

const createSession = () => createPublicSession() as InMemorySession;

/** Session synthétique : P1 Claire Martin, P2 Paul Durand, P10 (dix personnes), O2, L3, T1. */
function fixture() {
  const s = createSession();
  s.resolve("Claire Martin", "PERSON"); // PERSONNE_001
  s.resolve("Paul Durand", "PERSON"); // PERSONNE_002
  s.resolve("Alpha SA", "ORGANIZATION"); // ORGANISATION_001
  s.resolve("Beta SARL", "ORGANIZATION"); // ORGANISATION_002
  s.resolve("Lausanne", "LOCATION"); // LIEU_001
  s.resolve("Morges", "LOCATION"); // LIEU_002
  s.resolve("Nyon", "LOCATION"); // LIEU_003
  s.resolve("+00 11 222 33 44", "PHONE"); // TELEPHONE_001
  return s;
}

const tokens = (text: string, s = fixture()) =>
  findTokens(text, s).map((m) => ({ t: text.slice(m.start, m.end), c: m.canonical, s: m.status }));

describe("findTokens : variantes", () => {
  it("forme canonique avec positions", () => {
    const s = fixture();
    const text = "Voir PERSONNE_001, puis ORGANISATION_002.";
    const m = findTokens(text, s);
    expect(m).toHaveLength(2);
    expect(text.slice(m[0]!.start, m[0]!.end)).toBe("PERSONNE_001");
    expect(m[0]).toMatchObject({ canonical: "PERSONNE_001", status: "known" });
    expect(m[0]!.entityId).toBe(s.byPseudonym("PERSONNE_001")!.id);
    expect(m[1]).toMatchObject({ canonical: "ORGANISATION_002", status: "known" });
  });

  it.each([
    ["personne_001", "casse minuscule"],
    ["Personne_001", "casse mixte"],
    ["PERSONNE 001", "espace"],
    ["PERSONNE-001", "tiret"],
    ["PERSONNE–001", "tiret demi-cadratin"],
    ["PERSONNE\\_001", "tiret bas échappé"],
    ["PERSONNE_1", "zéros absents"],
    ["PERSONNE_01", "zéros partiels"],
    ["PERSONNE_0001", "zéros en trop"],
    ["PERSONNE\n001", "retour à la ligne"],
    ["PERSONNE _ 001", "espaces autour du tiret bas"],
    ["PERSON_001", "type traduit"],
    ["Person_001", "type traduit, casse mixte"],
    ["PERSON 001", "type traduit, espace"],
    ["PERSON-1", "type traduit, tiret, un chiffre"],
  ])("reconnaît %s (%s)", (variant) => {
    expect(tokens(`Bonjour ${variant}.`)).toEqual([{ t: variant, c: "PERSONNE_001", s: "known" }]);
  });

  it("traduction des autres types", () => {
    expect(tokens("ORGANIZATION_002 LOCATION_003 PLACE_001 PHONE_001 TÉLÉPHONE_001")).toEqual([
      { t: "ORGANIZATION_002", c: "ORGANISATION_002", s: "known" },
      { t: "LOCATION_003", c: "LIEU_003", s: "known" },
      { t: "PLACE_001", c: "LIEU_001", s: "known" },
      { t: "PHONE_001", c: "TELEPHONE_001", s: "known" },
      { t: "TÉLÉPHONE_001", c: "TELEPHONE_001", s: "known" },
    ]);
  });

  it("avale les crochets ajoutés, pas les guillemets ni les astérisques", () => {
    expect(tokens("[PERSONNE_001]")[0]!.t).toBe("[PERSONNE_001]");
    expect(tokens("[ PERSONNE_001 ]")[0]!.t).toBe("[ PERSONNE_001 ]");
    expect(tokens("\\[PERSONNE\\_001\\]")[0]!.t).toBe("\\[PERSONNE\\_001\\]");
    expect(tokens("[[PERSONNE_001]]")[0]!.t).toBe("[[PERSONNE_001]]");
    expect(tokens("«PERSONNE_001»")[0]!.t).toBe("PERSONNE_001");
    expect(tokens('"PERSONNE_001"')[0]!.t).toBe("PERSONNE_001");
    expect(tokens("**PERSONNE_001**")[0]!.t).toBe("PERSONNE_001");
    expect(tokens("`PERSONNE_001`")[0]!.t).toBe("PERSONNE_001");
    expect(tokens("_PERSONNE_001_")[0]!.t).toBe("PERSONNE_001");
  });

  it("n'avale pas des crochets déséquilibrés ou de familles différentes", () => {
    expect(tokens("[PERSONNE_001")[0]!.t).toBe("PERSONNE_001");
    expect(tokens("PERSONNE_001]")[0]!.t).toBe("PERSONNE_001");
    expect(tokens("[[PERSONNE_001]")[0]!.t).toBe("PERSONNE_001");
    expect(tokens("[PERSONNE_001}")[0]!.t).toBe("PERSONNE_001");
  });

  it("possessif anglais et pluriel accolés : le suffixe reste hors de la zone", () => {
    const text = "PERSON_001's book, PERSONNE_001’s, PERSONNE_001s";
    const t = tokens(text);
    expect(t.map((x) => x.t)).toEqual(["PERSON_001", "PERSONNE_001", "PERSONNE_001"]);
    expect(reidentify(text, fixture()).text).toBe(
      "Claire Martin's book, Claire Martin’s, Claire Martins",
    );
  });

  it("jetons adjacents et crochets collés", () => {
    expect(tokens("[PERSONNE_001][PERSONNE_002]").map((x) => x.t)).toEqual([
      "[PERSONNE_001]",
      "[PERSONNE_002]",
    ]);
    expect(tokens("PERSONNE_001/PERSONNE_002").map((x) => x.c)).toEqual([
      "PERSONNE_001",
      "PERSONNE_002",
    ]);
  });

  it("accepte la ponctuation, un tiret ou une apostrophe collés", () => {
    expect(tokens("(PERSONNE_001), PERSONNE_001. PERSONNE_001-ci d'PERSONNE_001")).toHaveLength(4);
  });
});

describe("findTokens : faux positifs", () => {
  it.each([
    "la personne 2 est venue",
    "Personne 2 a répondu",
    "lieu 3",
    "Lieu 3",
    "Phone 1",
    "une personne_ sans numéro",
    "PERSONNE seul",
    "PERSONNE 2024 a eu lieu",
  ])("ignore « %s »", (text) => {
    // « PERSONNE 2024 » : espace seul, type en majuscules, numéro inconnu → pas un jeton.
    const found = tokens(text);
    expect(found).toEqual([]);
  });

  it("ne remplace pas à l'intérieur d'un mot", () => {
    expect(tokens("IMPERSONNE_001")).toEqual([]);
    expect(tokens("XPERSONNE_001")).toEqual([]);
    expect(tokens("PERSONNE_001x")).toEqual([]);
    expect(tokens("PERSONNE_0012")[0]).toMatchObject({ c: "PERSONNE_012", s: "unknown" });
    expect(tokens("DEPERSON_001")).toEqual([]);
    expect(tokens("é PERSONNE_001é")).toEqual([]);
    expect(tokens("Lausanne_PERSONNE_001")).toEqual([]);
  });

  it("n'attrape pas « lieu - 2024 » ni « Lieu 3 » minuscule avec espace", () => {
    expect(tokens("le lieu - 2024")).toEqual([]);
    expect(tokens("au lieu 001")).toEqual([]);
  });

  it("tiret collé sans espace accepté même en minuscules (règle du spike)", () => {
    expect(tokens("personne-1")[0]).toMatchObject({ c: "PERSONNE_001", s: "known" });
  });

  it("PERSONNE_1 et PERSONNE_10 sont distincts", () => {
    const s = fixture();
    for (let i = 3; i <= 10; i++) s.resolve(`Personne Synthétique${"x".repeat(i)}`, "PERSON");
    expect(s.byPseudonym("PERSONNE_010")).toBeDefined();
    expect(tokens("PERSONNE_1 PERSONNE_10", s).map((x) => x.c)).toEqual([
      "PERSONNE_001",
      "PERSONNE_010",
    ]);
    expect(tokens("PERSONNE_10", fixture())).toEqual([
      { t: "PERSONNE_10", c: "PERSONNE_010", s: "unknown" },
    ]);
  });

  it("PERSON_002 n'est pas ORGANISATION_002", () => {
    expect(tokens("PERSON_002")[0]!.c).toBe("PERSONNE_002");
  });
});

describe("findTokens : statuts", () => {
  it("jeton au bon format absent de la session : unknown", () => {
    expect(tokens("PERSONNE_009 et PERSON_009 et [PERSONNE_009]")).toEqual([
      { t: "PERSONNE_009", c: "PERSONNE_009", s: "unknown" },
      { t: "PERSON_009", c: "PERSONNE_009", s: "unknown" },
      { t: "[PERSONNE_009]", c: "PERSONNE_009", s: "unknown" },
    ]);
  });

  it("l'espace seul sur un inconnu n'est reconnu qu'avec des zéros de tête", () => {
    expect(tokens("PERSONNE 009")[0]).toMatchObject({ s: "unknown" });
    expect(tokens("PERSONNE 9")).toEqual([]);
  });

  it("l'espace seul exige les majuscules, même pour un jeton connu", () => {
    expect(tokens("PERSONNE 001")[0]!.s).toBe("known");
    expect(tokens("Personne 001")).toEqual([]);
    expect(tokens("personne 1")).toEqual([]);
  });

  it("pseudonyme ambigu après fusion puis scission partielle", () => {
    const s = createSession();
    const a = s.resolve("Claire Martin", "PERSON");
    const b = s.resolve("Paul Durand", "PERSON");
    s.resolve("P. Durand", "PERSON");
    s.merge(a.id, b.id);
    s.split(a.id, "Paul Durand");
    const m = findTokens("PERSONNE_001 PERSONNE_002 PERSONNE_003", s);
    expect(m.map((x) => x.status)).toEqual(["known", "ambiguous", "known"]);
    expect(m[1]!.entityId).toBeUndefined();
  });

  it("fusion seule : le pseudonyme absorbé désigne la cible", () => {
    const s = createSession();
    const a = s.resolve("Claire Martin", "PERSON");
    const b = s.resolve("Paul Durand", "PERSON");
    s.merge(a.id, b.id);
    const m = findTokens("PERSONNE_002", s);
    expect(m[0]).toMatchObject({ status: "known", entityId: a.id });
  });

  it("texte vide, session vide", () => {
    expect(findTokens("", fixture())).toEqual([]);
    expect(findTokens("PERSONNE_001", createSession())[0]!.status).toBe("unknown");
  });
});

describe("reidentify", () => {
  it("remplace par la forme la plus longue par défaut", () => {
    const s = createSession();
    s.resolve("Claire Martin", "PERSON");
    s.resolve("Claire", "PERSON"); // rattachée
    s.resolve("Mme Martin", "PERSON");
    const e = s.entities()[0]!;
    expect(e.surfaceForms[0]).toBe("Claire Martin");
    expect(reidentify("PERSONNE_001 dit oui", s).text).toBe("Claire Martin dit oui");
  });

  it("option first et option fonction", () => {
    const s = createSession();
    const a = s.resolve("Claire", "PERSON");
    s.merge(a.id, s.resolve("Claire Martin", "PERSON").id);
    expect(s.entities()[0]!.surfaceForms).toEqual(["Claire", "Claire Martin"]);
    expect(reidentify("PERSONNE_001", s).text).toBe("Claire Martin");
    expect(reidentify("PERSONNE_001", s, { form: "first" }).text).toBe("Claire");
    expect(reidentify("PERSONNE_001", s, { form: () => "X" }).text).toBe("X");
  });

  it("laisse inconnus et ambigus tels quels et les liste", () => {
    const s = createSession();
    const a = s.resolve("Claire Martin", "PERSON");
    const b = s.resolve("Paul Durand", "PERSON");
    s.resolve("P. Durand", "PERSON");
    s.merge(a.id, b.id);
    s.split(a.id, "Paul Durand");
    const text = "PERSONNE_001, PERSONNE_002, PERSONNE_009.";
    const r = reidentify(text, s);
    expect(r.text).toBe("Claire Martin, PERSONNE_002, PERSONNE_009.");
    expect(r.replacements.map((x) => x.pseudonym)).toEqual(["PERSONNE_001"]);
    expect(r.ambiguous).toEqual([{ start: 14, end: 26, pseudonym: "PERSONNE_002" }]);
    expect(r.unknown).toEqual([{ start: 28, end: 40, pseudonym: "PERSONNE_009" }]);
  });

  it("positions du texte reçu et du texte produit, avec accents et emojis", () => {
    const s = fixture();
    const text = "Éloïse 😀 : PERSON_001’s café ☕ chez [ORGANISATION_001] à LIEU 001 😀.";
    const r = reidentify(text, s);
    expect(r.text).toBe("Éloïse 😀 : Claire Martin’s café ☕ chez Alpha SA à Lausanne 😀.");
    expect(r.replacements).toHaveLength(3);
    for (const x of r.replacements) {
      expect(r.text.slice(x.outputStart, x.outputEnd)).toBe(
        s.byPseudonym(x.pseudonym)!.surfaceForms[0],
      );
    }
    expect(text.slice(r.replacements[1]!.start, r.replacements[1]!.end)).toBe("[ORGANISATION_001]");
    expect(text.slice(r.replacements[0]!.start, r.replacements[0]!.end)).toBe("PERSON_001");
  });

  it("idempotent sur un texte sans jeton, et ne touche pas « la personne 2 »", () => {
    const s = fixture();
    const text = "La personne 2 et la Personne 1 ne sont pas des jetons.";
    const r = reidentify(text, s);
    expect(r.text).toBe(text);
    expect(r).toMatchObject({ replacements: [], unknown: [], ambiguous: [] });
  });

  it("aucun nom en clair dans les rapports", () => {
    const s = createSession();
    const a = s.resolve("Claire Martin", "PERSON");
    const b = s.resolve("Paul Durand", "PERSON");
    s.resolve("P. Durand", "PERSON");
    s.resolve("Alpha SA", "ORGANIZATION");
    s.merge(a.id, b.id);
    s.split(a.id, "Paul Durand");
    const r = reidentify("PERSONNE_001 PERSONNE_002 PERSONNE_009 ORGANISATION_001", s);
    const json = JSON.stringify({
      replacements: r.replacements,
      unknown: r.unknown,
      ambiguous: r.ambiguous,
    });
    for (const name of ["Claire", "Martin", "Durand", "Alpha"]) expect(json).not.toContain(name);
    expect(r.text).toContain("Claire Martin");
  });
});

describe("aller-retour", () => {
  it("pseudonymisation, réponse déformée, réidentification", () => {
    const s = createSession();
    const original =
      "Claire Martin travaille chez Alpha SA à Lausanne. Paul Durand l'appelle au +00 11 222 33 44.";
    const pseudo = run(s, original, [
      ["Claire Martin", "PERSON"],
      ["Alpha SA", "ORGANIZATION"],
      ["Lausanne", "LOCATION"],
      ["Paul Durand", "PERSON"],
      ["+00 11 222 33 44", "PHONE"],
    ]);
    expect(pseudo).toBe(
      "PERSONNE_001 travaille chez ORGANISATION_001 à LIEU_001. PERSONNE_002 l'appelle au TELEPHONE_001.",
    );
    // Réponse de LLM qui déforme chaque jeton.
    const llm =
      "[PERSON_001] works at *Organization-1* in `LOCATION 001`. " +
      "PERSONNE\\_002's call goes to Telephone_1. Merci, personne 2 !";
    const r = reidentify(llm, s);
    expect(r.text).toBe(
      "Claire Martin works at *Alpha SA* in `Lausanne`. " +
        "Paul Durand's call goes to +00 11 222 33 44. Merci, personne 2 !",
    );
    expect(r.unknown).toEqual([]);
    expect(r.ambiguous).toEqual([]);
    expect(r.replacements).toHaveLength(5);
  });

  it("traduction complète en anglais", () => {
    const s = createSession();
    const pseudo = run(s, "Claire Martin habite à Lausanne, chez Alpha SA.", [
      ["Claire Martin", "PERSON"],
      ["Lausanne", "LOCATION"],
      ["Alpha SA", "ORGANIZATION"],
    ]);
    const english = pseudo
      .replace("PERSONNE_001", "PERSON_001")
      .replace("LIEU_001", "LOCATION_001")
      .replace("ORGANISATION_001", "ORGANIZATION_001")
      .replace("habite à", "lives in")
      .replace("chez", "at");
    expect(reidentify(english, s).text).toBe("Claire Martin lives in Lausanne, at Alpha SA.");
  });
});

describe("buildPromptNotice", () => {
  it("renvoie la consigne de l'ADR 0002 en français et en anglais", () => {
    const n = buildPromptNotice();
    expect(n.fr).toBe(
      "Les mots de la forme PERSONNE_001 (par exemple ORGANISATION_002 ou LIEU_003) sont des pseudonymes : recopie-les à l'identique, sans les traduire, les modifier ni les expliquer.",
    );
    expect(n.en).toContain("PERSONNE_001");
    expect(n.en).toContain("without translating");
    expect(buildPromptNotice("A")).toEqual(n);
  });

  it("les exemples de la consigne sont des jetons reconnus", () => {
    const s = fixture();
    const n = buildPromptNotice();
    expect(findTokens(n.fr, s).map((m) => m.canonical)).toEqual([
      "PERSONNE_001",
      "ORGANISATION_002",
      "LIEU_003",
    ]);
  });
});
