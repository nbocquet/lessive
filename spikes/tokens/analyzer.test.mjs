import { describe, expect, it } from "vitest";
import { analyze, findStrict, reidentify } from "./analyzer.mjs";
import { FORMATS, FORMAT_IDS } from "./formats.mjs";

// Données synthétiques uniquement (R10).
const tableA = {
  PERSONNE_001: "Claire Martin",
  PERSONNE_002: "Paul Durand",
  ORGANISATION_002: "Acme SA",
  LIEU_003: "Lausanne",
  EMAIL_001: "claire@example.org",
  TELEPHONE_001: "+41 22 555 01 00",
  IBAN_001: "CH93 0076 2011 6238 5295 7",
  AVS_001: "756.1234.5678.97",
};
const tableB = {
  "[PERSONNE_1]": "Claire Martin",
  "[PERSONNE_2]": "Paul Durand",
  "[ORGANISATION_2]": "Acme SA",
  "[LIEU_3]": "Lausanne",
};
const tableC = {
  "⟦P1⟧": "Claire Martin",
  "⟦P2⟧": "Paul Durand",
  "⟦O2⟧": "Acme SA",
  "⟦L3⟧": "Lausanne",
  "⟦E1⟧": "claire@example.org",
};

const tokensOf = (text, format, table) => analyze(text, { format, table }).matches.map((m) => m.token);
const unknownOf = (text, format, table) => analyze(text, { format, table }).unknown.map((u) => u.text);

describe("formats", () => {
  it("produit et relit les jetons canoniques", () => {
    expect(FORMATS.A.render("PERSON", 1)).toBe("PERSONNE_001");
    expect(FORMATS.A.render("PHONE", 12)).toBe("TELEPHONE_012");
    expect(FORMATS.B.render("ORGANIZATION", 2)).toBe("[ORGANISATION_2]");
    expect(FORMATS.C.render("LOCATION", 3)).toBe("⟦L3⟧");
    for (const id of FORMAT_IDS) {
      const t = FORMATS[id].render("CH_AVS", 7);
      expect(FORMATS[id].parse(t)).toEqual({ type: "CH_AVS", number: 7 });
    }
    expect(FORMATS.A.parse("PERSONNE_1x")).toBeNull();
    expect(FORMATS.A.parse("[PERSONNE_1]")).toBeNull();
  });
});

describe("analyze — validation d'entrée", () => {
  it("refuse une clé de table invalide pour le format", () => {
    expect(() => analyze("x", { format: "A", table: { "[PERSONNE_1]": "x" } })).toThrow();
    expect(() => analyze("x", { format: "Z", table: {} })).toThrow();
  });
  it("gère texte vide et table vide", () => {
    expect(analyze("", { format: "A", table: tableA })).toEqual({ matches: [], unknown: [], found: [] });
    const r = analyze("PERSONNE_001", { format: "A", table: {} });
    expect(r.matches).toEqual([]);
    expect(r.unknown.map((u) => u.text)).toEqual(["PERSONNE_001"]);
  });
});

describe("format A — forme exacte et positions", () => {
  it("trouve le jeton canonique avec ses positions", () => {
    const text = "Bonjour PERSONNE_001, merci.";
    const { matches } = analyze(text, { format: "A", table: tableA });
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({ start: 8, end: 20, token: "PERSONNE_001", variants: [] });
    expect(text.slice(matches[0].start, matches[0].end)).toBe("PERSONNE_001");
  });
  it("trouve plusieurs jetons, répétés, dans l'ordre", () => {
    const text = "PERSONNE_002 écrit à PERSONNE_001 ; PERSONNE_001 répond à ORGANISATION_002.";
    expect(tokensOf(text, "A", tableA)).toEqual([
      "PERSONNE_002",
      "PERSONNE_001",
      "PERSONNE_001",
      "ORGANISATION_002",
    ]);
  });
  it("compte les positions en unités UTF-16 (emoji = 2 unités)", () => {
    const text = "😀 PERSONNE_001";
    const [m] = analyze(text, { format: "A", table: tableA }).matches;
    expect(m.start).toBe(3);
    expect(text.slice(m.start, m.end)).toBe("PERSONNE_001");
  });
  it("accepte la ponctuation finale", () => {
    expect(tokensOf("Merci à PERSONNE_001.", "A", tableA)).toEqual(["PERSONNE_001"]);
    expect(tokensOf("(PERSONNE_001)", "A", tableA)).toEqual(["PERSONNE_001"]);
  });
});

describe("format A — variantes tolérées", () => {
  it.each([
    ["personne_001", ["case"]],
    ["Personne_001", ["case"]],
    ["PERSONNE 001", ["separator"]],
    ["PERSONNE-001", ["separator"]],
    ["PERSONNE - 001", ["separator"]],
    ["PERSONNE 001", ["separator"]],
    ["PERSONNE–001", ["separator"]],
    ["PERSONNE\\_001", ["escaped-separator"]],
    ["personne-001", ["case", "separator"]],
  ])("séparateur / casse : %s", (variant, expected) => {
    const r = analyze(`Voir ${variant} ici.`, { format: "A", table: tableA });
    expect(r.matches.map((m) => m.token)).toEqual(["PERSONNE_001"]);
    expect(r.matches[0].variants).toEqual(expected);
    expect(r.matches[0].text).toBe(variant);
  });

  it.each(["PERSONNE_1", "PERSONNE_01", "PERSONNE_0001", "PERSONNE_000001"])(
    "zéros de tête : %s",
    (variant) => {
      const r = analyze(`Voir ${variant}.`, { format: "A", table: tableA });
      expect(r.matches.map((m) => m.token)).toEqual(["PERSONNE_001"]);
      expect(r.matches[0].variants).toEqual(["zeros"]);
    },
  );

  it.each([
    ["**PERSONNE_001**", "PERSONNE_001"],
    ["`PERSONNE_001`", "PERSONNE_001"],
    ["*PERSONNE_001*", "PERSONNE_001"],
    ["_PERSONNE_001_", "PERSONNE_001"],
    ["__PERSONNE_001__", "PERSONNE_001"],
    ['"PERSONNE_001"', "PERSONNE_001"],
    ["« PERSONNE_001 »", "PERSONNE_001"],
    ["'PERSONNE_001'", "PERSONNE_001"],
    ["(PERSONNE_001)", "PERSONNE_001"],
  ])("décorations laissées en place : %s", (decorated, core) => {
    const r = analyze(`Voir ${decorated}.`, { format: "A", table: tableA });
    expect(r.matches).toHaveLength(1);
    expect(r.matches[0].text).toBe(core);
  });

  it("marque les décorations markdown", () => {
    const [m] = analyze("**PERSONNE_001**", { format: "A", table: tableA }).matches;
    expect(m.variants).toContain("decorated");
  });

  it.each(["[PERSONNE_001]", "\\[PERSONNE\\_001\\]", "{PERSONNE_001}", "[ PERSONNE_001 ]", "[[PERSONNE_001]]"])(
    "crochets ajoutés par le LLM, avalés : %s",
    (variant) => {
      const r = analyze(`Voir ${variant}.`, { format: "A", table: tableA });
      expect(r.matches).toHaveLength(1);
      expect(r.matches[0].text).toBe(variant);
      expect(r.matches[0].variants).toContain("brackets-added");
    },
  );

  it("n'avale pas des crochets déséquilibrés", () => {
    const r = analyze("Voir [PERSONNE_001 ici.", { format: "A", table: tableA });
    expect(r.matches[0].text).toBe("PERSONNE_001");
    const r2 = analyze("Voir [[PERSONNE_001] ici.", { format: "A", table: tableA });
    expect(r2.matches[0].text).toBe("PERSONNE_001");
  });

  it.each([
    ["PERSON_001", "PERSONNE_001"],
    ["Person_001", "PERSONNE_001"],
    ["ORGANIZATION_002", "ORGANISATION_002"],
    ["ORGANISATION_002", "ORGANISATION_002"],
    ["LOCATION_003", "LIEU_003"],
    ["PLACE_003", "LIEU_003"],
    ["PHONE_001", "TELEPHONE_001"],
    ["TÉLÉPHONE_001", "TELEPHONE_001"],
    ["telephone_001", "TELEPHONE_001"],
    ["EMAIL_001", "EMAIL_001"],
    ["E-MAIL_001", "EMAIL_001"],
    ["AHV_001", "AVS_001"],
    ["OASI_001", "AVS_001"],
    ["IBAN_001", "IBAN_001"],
    ["PERSON 001", "PERSONNE_001"],
  ])("type traduit : %s", (variant, token) => {
    expect(tokensOf(`Voir ${variant}.`, "A", tableA)).toEqual([token]);
  });

  it("marque la traduction du type", () => {
    const [m] = analyze("PERSON_001", { format: "A", table: tableA }).matches;
    expect(m.variants).toEqual(["translated"]);
  });

  it.each([
    ["PERSONNE_001's", "possessive"],
    ["PERSON_001’s", "possessive"],
    ["PERSON_001S", "plural"],
    ["PERSON_001s", "plural"],
  ])("possessif / pluriel anglais : %s", (variant, suffix) => {
    const r = analyze(`Voir ${variant} email.`, { format: "A", table: tableA });
    expect(r.matches).toHaveLength(1);
    expect(r.matches[0].suffix).toBe(suffix);
    expect(r.matches[0].text).toMatch(/_001$/); // le suffixe reste hors de la correspondance
  });

  it.each(["PERSONNE_\n001", "PERSONNE\n_001", "PERSONNE_\r\n001", "PERSONNE\n001", "PERSONNE_ \n 001"])(
    "jeton coupé par un retour à la ligne : %j",
    (variant) => {
      const r = analyze(`Voir ${variant}.`, { format: "A", table: tableA });
      expect(r.matches.map((m) => m.token)).toEqual(["PERSONNE_001"]);
      expect(r.matches[0].variants).toContain("linebreak");
    },
  );

  it("ne recolle pas à travers un saut de paragraphe", () => {
    expect(tokensOf("Voir PERSONNE\n\n001.", "A", tableA)).toEqual([]);
    expect(tokensOf("Voir PERSONNE_\n\n001.", "A", tableA)).toEqual([]);
  });
});

describe("format A — chiffres, mots et collisions", () => {
  const table = { PERSONNE_001: "Un", PERSONNE_010: "Dix", PERSONNE_100: "Cent" };

  it("ne confond pas PERSONNE_1 et PERSONNE_10", () => {
    expect(tokensOf("PERSONNE_10 et PERSONNE_1", "A", table)).toEqual(["PERSONNE_010", "PERSONNE_001"]);
    expect(tokensOf("PERSONNE_100", "A", table)).toEqual(["PERSONNE_100"]);
  });
  it("ne prend pas PERSONNE_10 pour PERSONNE_1 quand 10 n'existe pas", () => {
    const only1 = { PERSONNE_001: "Un" };
    const r = analyze("PERSONNE_10", { format: "A", table: only1 });
    expect(r.matches).toEqual([]);
    expect(r.unknown.map((u) => u.text)).toEqual(["PERSONNE_10"]);
    const r2 = analyze("PERSONNE_0010 PERSONNE_1234", { format: "A", table: only1 });
    expect(r2.matches).toEqual([]);
    expect(r2.unknown).toHaveLength(2);
  });
  it.each([
    "SUPERPERSONNE_001",
    "XPERSONNE_001",
    "MY_PERSONNE_001",
    "mon_personne_001",
    "PERSONNE_001abc",
    "PERSONNE_001_suite",
    "PERSONNE_001x",
    "PERSONNE_001st",
    "PERSONNEL_001",
    "2PERSONNE_001",
    "ÉPERSONNE_001",
  ])("ne remplace pas à l'intérieur d'un autre mot : %s", (word) => {
    const r = analyze(`voir ${word} ici`, { format: "A", table: tableA });
    expect(r.matches).toEqual([]);
  });
  it("reconnaît un jeton collé à un tiret ou une apostrophe", () => {
    expect(tokensOf("de-PERSONNE_001", "A", tableA)).toEqual(["PERSONNE_001"]);
    expect(tokensOf("l'PERSONNE_001", "A", tableA)).toEqual(["PERSONNE_001"]);
    expect(tokensOf("PERSONNE_001/PERSONNE_002", "A", tableA)).toEqual(["PERSONNE_001", "PERSONNE_002"]);
  });
  it("ne prend pas le type d'un autre jeton : PERSON_002 n'est pas ORGANISATION_002", () => {
    const r = analyze("PERSON_002 et ORGANIZATION_002", { format: "A", table: tableA });
    expect(r.matches.map((m) => m.token)).toEqual(["PERSONNE_002", "ORGANISATION_002"]);
    const r2 = analyze("PERSONNE_003", { format: "A", table: tableA });
    expect(r2.unknown.map((u) => u.text)).toEqual(["PERSONNE_003"]);
  });
});

describe("format A — jetons inconnus", () => {
  it("signale PERSONNE_009 avec sa position et ne le remplace pas", () => {
    const text = "Voir PERSONNE_009 et PERSONNE_001.";
    const r = analyze(text, { format: "A", table: tableA });
    expect(r.matches.map((m) => m.token)).toEqual(["PERSONNE_001"]);
    expect(r.unknown).toHaveLength(1);
    expect(r.unknown[0]).toMatchObject({ start: 5, end: 17, text: "PERSONNE_009", type: "PERSON", number: 9 });
    expect(reidentify(text, { format: "A", table: tableA }).text).toBe("Voir PERSONNE_009 et Claire Martin.");
  });
  it("signale un type du format absent de la table", () => {
    expect(unknownOf("Appelez TELEPHONE_007.", "A", { PERSONNE_001: "x" })).toEqual(["TELEPHONE_007"]);
    expect(unknownOf("Appelez PHONE_007.", "A", { PERSONNE_001: "x" })).toEqual(["PHONE_007"]);
  });
  it("signale aussi les inconnus entre crochets", () => {
    expect(unknownOf("Voir [PERSONNE_009].", "A", tableA)).toEqual(["[PERSONNE_009]"]);
  });
});

describe("format A — faux positifs à éviter", () => {
  it.each([
    "la personne 2 a répondu",
    "Personne 1 a répondu",
    "Person 1 said hello",
    "le lieu 3 est libre",
    "Lieu 3",
    "email 1 et phone 1",
    "PERSONNE",
    "PERSONNE_",
    "PERSONNE_abc",
    "personnes 001",
    "Il y a une PERSONNE et 001 raisons",
    "LIEU: 3",
  ])("ne trouve rien dans : %s", (text) => {
    const r = analyze(text, { format: "A", table: tableA });
    expect(r.matches).toEqual([]);
    expect(r.unknown).toEqual([]);
  });

  it("accepte volontairement l'espace seul quand le type est en majuscules et le jeton existe", () => {
    expect(tokensOf("LIEU 3", "A", tableA)).toEqual(["LIEU_003"]);
    expect(tokensOf("AVS 1 et IBAN 1", "A", tableA)).toEqual(["AVS_001", "IBAN_001"]);
  });

  it.each(["ISO_8601", "UTF_8", "COVID_19", "SHA_256", "Lieu - 2024", "AVS 2000", "PERSON - 2024", "phone 06 12"])(
    "ne signale pas d'inconnu dans : %s",
    (text) => {
      const r = analyze(text, { format: "A", table: tableA });
      expect(r.matches).toEqual([]);
      expect(r.unknown).toEqual([]);
    },
  );

  it("n'accepte pas l'espace seul avec un type en minuscules, même si le jeton existe", () => {
    expect(tokensOf("lieu 3 et Lieu 3", "A", tableA)).toEqual([]);
    expect(tokensOf("LIEU 3", "A", tableA)).toEqual(["LIEU_003"]);
  });
});

describe("format B", () => {
  it("reconnaît la forme canonique sans variante", () => {
    const text = "Bonjour [PERSONNE_1], voici [ORGANISATION_2].";
    const r = analyze(text, { format: "B", table: tableB });
    expect(r.matches.map((m) => [m.token, m.variants])).toEqual([
      ["[PERSONNE_1]", []],
      ["[ORGANISATION_2]", []],
    ]);
    expect(r.matches[0]).toMatchObject({ start: 8, end: 20, text: "[PERSONNE_1]" });
  });
  it.each([
    ["[PERSONNE_001]", ["zeros"]],
    ["[personne_1]", ["case"]],
    ["[PERSON_1]", ["translated"]],
    ["[PERSONNE 1]", ["separator"]],
    ["[ PERSONNE_1 ]", []],
    ["\\[PERSONNE\\_1\\]", ["escaped-separator", "brackets-changed"]],
    ["[[PERSONNE_1]]", ["brackets-changed"]],
    ["{PERSONNE_1}", ["brackets-changed"]],
    ["PERSONNE_1", ["brackets-missing"]],
    ["PERSONNE_001", ["brackets-missing", "zeros"]],
    ["[PERSONNE_\n1]", ["linebreak"]],
  ])("variante : %s", (variant, expected) => {
    const r = analyze(`Voir ${variant} ici.`, { format: "B", table: tableB });
    expect(r.matches.map((m) => m.token)).toEqual(["[PERSONNE_1]"]);
    expect([...r.matches[0].variants].sort()).toEqual([...expected].sort());
  });
  it("laisse les parenthèses en place quand le LLM remplace les crochets", () => {
    const [m] = analyze("Voir (PERSONNE_1).", { format: "B", table: tableB }).matches;
    expect(m.text).toBe("PERSONNE_1");
    expect(m.variants).toContain("brackets-missing");
  });
  it("gère le possessif après le crochet fermant", () => {
    const [m] = analyze("[PERSON_1]'s email", { format: "B", table: tableB }).matches;
    expect(m).toMatchObject({ token: "[PERSONNE_1]", text: "[PERSON_1]", suffix: "possessive" });
  });
  it("gère des jetons adjacents", () => {
    expect(tokensOf("[PERSONNE_1][PERSONNE_2]", "B", tableB)).toEqual(["[PERSONNE_1]", "[PERSONNE_2]"]);
    expect(tokensOf("[PERSONNE_1], [PERSONNE_2]", "B", tableB)).toEqual(["[PERSONNE_1]", "[PERSONNE_2]"]);
  });
  it("distingue [PERSONNE_1] de [PERSONNE_10]", () => {
    const table = { "[PERSONNE_1]": "Un", "[PERSONNE_10]": "Dix" };
    expect(tokensOf("[PERSONNE_10] puis [PERSONNE_1]", "B", table)).toEqual(["[PERSONNE_10]", "[PERSONNE_1]"]);
    expect(unknownOf("[PERSONNE_11]", "B", table)).toEqual(["[PERSONNE_11]"]);
  });
  it("signale [PERSONNE_9] comme inconnu", () => {
    const r = analyze("Voir [PERSONNE_9] et [PERSONNE_1].", { format: "B", table: tableB });
    expect(r.unknown.map((u) => u.text)).toEqual(["[PERSONNE_9]"]);
    expect(r.matches.map((m) => m.token)).toEqual(["[PERSONNE_1]"]);
  });
  it.each(["[1]", "[Annexe 1]", "[personne 1]", "[sic]", "[PERSONNE]", "tableau[1]", "[lieu 2]", "[LIEU]"])(
    "faux positif évité : %s",
    (text) => {
      const r = analyze(text, { format: "B", table: tableB });
      expect(r.matches).toEqual([]);
      expect(r.unknown).toEqual([]);
    },
  );
  it("ne remplace pas dans un autre mot", () => {
    expect(tokensOf("X[PERSONNE_1]", "B", tableB)).toEqual(["[PERSONNE_1]"]); // crochets = délimiteurs
    expect(tokensOf("SUPERPERSONNE_1", "B", tableB)).toEqual([]);
    expect(tokensOf("PERSONNE_1a", "B", tableB)).toEqual([]);
  });
});

describe("format C", () => {
  it("reconnaît la forme canonique sans variante", () => {
    const text = "Bonjour ⟦P1⟧ et ⟦O2⟧.";
    const r = analyze(text, { format: "C", table: tableC });
    expect(r.matches.map((m) => [m.token, m.variants])).toEqual([
      ["⟦P1⟧", []],
      ["⟦O2⟧", []],
    ]);
    expect(r.matches[0]).toMatchObject({ start: 8, end: 12 });
  });
  it.each([
    ["[[P1]]", ["delimiters-changed"]],
    ["[P1]", ["delimiters-changed"]],
    ["\\[\\[P1\\]\\]", ["delimiters-changed"]],
    ["〚P1〛", ["delimiters-changed"]],
    ["⟦ P1 ⟧", ["spaces"]],
    ["⟦p1⟧", ["case"]],
    ["⟦P01⟧", ["zeros"]],
    ["⟦P_1⟧", ["separator"]],
    ["⟦P 1⟧", ["separator"]],
    ["⟦P-1⟧", ["separator"]],
    ["⟦P1", ["delimiter-partial"]],
    ["P1⟧", ["delimiter-partial"]],
  ])("variante : %s", (variant, expected) => {
    const r = analyze(`Voir ${variant} ici.`, { format: "C", table: tableC });
    expect(r.matches.map((m) => m.token)).toEqual(["⟦P1⟧"]);
    expect([...r.matches[0].variants].sort()).toEqual([...expected].sort());
  });
  it("distingue ⟦P1⟧ de ⟦P10⟧", () => {
    const table = { "⟦P1⟧": "Un", "⟦P10⟧": "Dix" };
    expect(tokensOf("⟦P10⟧ ⟦P1⟧ [[P10]]", "C", table)).toEqual(["⟦P10⟧", "⟦P1⟧", "⟦P10⟧"]);
  });
  it("signale les inconnus", () => {
    expect(unknownOf("⟦P9⟧ [P9] ⟦Z1⟧", "C", tableC)).toEqual(["⟦P9⟧", "[P9]", "⟦Z1⟧"]);
  });
  it("gère le possessif et les positions UTF-16", () => {
    const text = "😀 ⟦P1⟧'s";
    const [m] = analyze(text, { format: "C", table: tableC }).matches;
    expect(m).toMatchObject({ start: 3, end: 7, suffix: "possessive" });
  });
  it.each([
    "P1",
    "le plan P1 prévoit",
    "E1 vs E2",
    "[Z1]",
    "[A1:B2]",
    "[P1",
    "P1]",
    "[1]",
    "P 1",
    "[ ]",
    "⟦⟧",
  ])("faux positif évité : %s", (text) => {
    const r = analyze(text, { format: "C", table: tableC });
    expect(r.matches).toEqual([]);
    expect(r.unknown).toEqual([]);
  });
});

describe("reidentify", () => {
  it("remplace les variantes par la valeur et conserve décorations et suffixes", () => {
    const text = "**PERSONNE_001** a écrit à PERSON_002's équipe chez [ORGANISATION_2].";
    const r = reidentify(text, { format: "A", table: tableA });
    expect(r.text).toBe("**Claire Martin** a écrit à Paul Durand's équipe chez Acme SA.");
    expect(r.replaced).toBe(3);
  });
  it("laisse les inconnus et le reste du texte intacts", () => {
    const text = "PERSONNE_001 / PERSONNE_099 / PERSONNE_1 / ORGANIZATION_042";
    const r = reidentify(text, { format: "A", table: tableA });
    expect(r.text).toBe("Claire Martin / PERSONNE_099 / Claire Martin / ORGANIZATION_042");
    expect(r.unknown.map((u) => u.text)).toEqual(["PERSONNE_099", "ORGANIZATION_042"]);
  });
  it("remplace pour le format B et C, y compris crochets avalés", () => {
    expect(reidentify("Voir [PERSON_001] et PERSONNE_2.", { format: "B", table: tableB }).text).toBe(
      "Voir Claire Martin et Paul Durand.",
    );
    expect(reidentify("Voir [[P1]] et ⟦O2⟧.", { format: "C", table: tableC }).text).toBe(
      "Voir Claire Martin et Acme SA.",
    );
  });
  it("est idempotent sur un texte sans jeton", () => {
    const text = "Rien à voir ici, personne 1 et lieu 2.";
    expect(reidentify(text, { format: "A", table: tableA })).toEqual({ text, replaced: 0, unknown: [] });
  });
});

describe("findStrict", () => {
  it("ne compte que la forme exacte avec frontières", () => {
    const text = "PERSONNE_001, personne_001, PERSONNE_0010, PERSONNE_001x, **PERSONNE_001**, PERSONNE_001";
    expect(findStrict(text, { format: "A", table: tableA }).get("PERSONNE_001")).toBe(3);
  });
  it("distingue [PERSONNE_1] de [PERSONNE_10] et reconnaît ⟦P1⟧", () => {
    expect(findStrict("[PERSONNE_10] [PERSONNE_1]", { format: "B", table: tableB }).get("[PERSONNE_1]")).toBe(1);
    expect(findStrict("[[P1]] ⟦P1⟧", { format: "C", table: tableC }).get("⟦P1⟧")).toBe(1);
  });
  it("renvoie une table vide quand rien n'est trouvé", () => {
    expect(findStrict("PERSON_001", { format: "A", table: tableA }).size).toBe(0);
  });
});
