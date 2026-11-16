import { describe, expect, it } from "vitest";
import { VALIDATOR_NAMES } from "../types/index.ts";
import { getValidator, validators } from "./index.ts";

/**
 * Données 100 % synthétiques (R10) : numéros inventés, clés calculées ici par des
 * implémentations indépendantes de celles de src (BigInt, boucles naïves).
 * Les exemples publiés dans des documentations sont signalés comme tels.
 */

/** Générateur pseudo-aléatoire déterministe (LCG), pour des tests reproductibles. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}
function randDigits(r: () => number, n: number): string {
  let out = "";
  for (let i = 0; i < n; i++) out += Math.floor(r() * 10);
  return out;
}
/** Dernier chiffre de Luhn : on essaie les 10 candidats. */
function withLuhn(body: string): string {
  for (let k = 0; k < 10; k++) {
    const full = body + k;
    let sum = 0;
    for (let i = 0; i < full.length; i++) {
      let d = Number(full[full.length - 1 - i]);
      if (i % 2 === 1) {
        d *= 2;
        if (d > 9) d -= 9;
      }
      sum += d;
    }
    if (sum % 10 === 0) return full;
  }
  throw new Error("inatteignable");
}
/** Remplace le dernier caractère par un autre chiffre (toujours détecté par une clé de contrôle). */
function breakLast(s: string): string {
  const last = Number(s[s.length - 1]);
  return s.slice(0, -1) + ((last + 1) % 10);
}
function group(s: string, size: number, sep: string): string {
  return (s.match(new RegExp(`.{1,${size}}`, "g")) ?? []).join(sep);
}

describe("registre", () => {
  it("fournit une fonction pour chaque nom de la liste fermée", () => {
    expect(Object.keys(validators).sort()).toEqual([...VALIDATOR_NAMES].sort());
    for (const name of VALIDATOR_NAMES) expect(getValidator(name)).toBe(validators[name]);
  });
  it("rejette la chaîne vide pour tous les validateurs", () => {
    for (const name of VALIDATOR_NAMES) expect(getValidator(name)("")).toBe(false);
  });
});

describe("luhn", () => {
  const v = getValidator("luhn");
  const r = rng(1);
  const valid = [
    withLuhn(randDigits(r, 11)), // 12 chiffres
    withLuhn(randDigits(r, 14)),
    withLuhn(randDigits(r, 15)), // 16 chiffres
    withLuhn(randDigits(r, 15)),
    withLuhn(randDigits(r, 14)),
    withLuhn(randDigits(r, 17)),
    withLuhn(randDigits(r, 18)), // 19 chiffres
    withLuhn(randDigits(r, 15)),
    withLuhn(randDigits(r, 12)),
    withLuhn(randDigits(r, 15)),
  ];
  it.each(valid)("accepte %s", (n) => expect(v(n)).toBe(true));
  it("accepte espaces et tirets de groupement", () => {
    const n = valid[2]!;
    expect(v(group(n, 4, " "))).toBe(true);
    expect(v(group(n, 4, "-"))).toBe(true);
  });
  it("accepte un numéro de test publié par les processeurs de paiement", () => {
    expect(v("4111 1111 1111 1111")).toBe(true);
  });
  const invalid = [
    ...valid.slice(0, 6).map(breakLast),
    withLuhn(randDigits(r, 10)), // 11 chiffres : trop court
    withLuhn(randDigits(r, 19)), // 20 chiffres : trop long
    "4111 1111 1111 111A",
    "4111.1111.1111.1111",
  ];
  it.each(invalid)("refuse %s", (n) => expect(v(n)).toBe(false));
  it("refuse lettres, chaîne vide et blancs", () => {
    expect(v("")).toBe(false);
    expect(v("   ")).toBe(false);
    expect(v("abcdabcdabcdabcd")).toBe(false);
  });
});

describe("iban_mod97", () => {
  const v = getValidator("iban_mod97");
  const r = rng(2);
  const LENGTHS: Record<string, number> = {
    CH: 21,
    LI: 21,
    FR: 27,
    DE: 22,
    IT: 27,
    AT: 20,
    BE: 16,
    ES: 24,
    NL: 18,
    LU: 20,
    GB: 22,
    MC: 27,
  };
  /** Calcule la clé via BigInt (ISO 7064 mod 97-10). */
  function makeIban(country: string, len: number): string {
    let bban = "";
    const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    for (let i = 0; i < len - 4; i++) bban += alphabet[Math.floor(r() * 36)];
    const toNum = (s: string) =>
      [...s].map((c) => (/[A-Z]/.test(c) ? String(c.charCodeAt(0) - 55) : c)).join("");
    const check = 98n - (BigInt(toNum(bban + country) + "00") % 97n);
    return `${country}${check.toString().padStart(2, "0")}${bban}`;
  }
  const valid = [
    ...Object.entries(LENGTHS).map(([c, l]) => makeIban(c, l)),
    makeIban("PL", 28), // pays hors liste : 15 à 34 acceptés
    makeIban("XX", 15),
    makeIban("XX", 34),
  ];
  it.each(valid)("accepte %s", (n) => expect(v(n)).toBe(true));
  it("accepte la présentation groupée, les séparateurs et les minuscules", () => {
    const n = valid[0]!;
    expect(v(group(n, 4, " "))).toBe(true);
    expect(v(group(n, 4, "-"))).toBe(true);
    expect(v(n.toLowerCase())).toBe(true);
  });
  it("accepte les exemples de la documentation SWIFT/ISO 13616", () => {
    expect(v("CH93 0076 2011 6238 5295 7")).toBe(true);
    expect(v("GB82 WEST 1234 5698 7654 32")).toBe(true);
    expect(v("DE89 3704 0044 0532 0130 00")).toBe(true);
  });
  const invalid = [
    ...valid.slice(0, 8).map(breakLast),
    valid[0]!.slice(0, -1), // CH trop court
    valid[0]! + "0", // CH trop long
    makeIban("FR", 26), // longueur FR incorrecte malgré une clé correcte
    makeIban("XX", 14), // pays inconnu trop court
    makeIban("XX", 35), // pays inconnu trop long
    "1234567890123456", // pas de code pays
    "CHXX0076201162385295",
  ];
  it.each(invalid)("refuse %s", (n) => expect(v(n)).toBe(false));
  it("refuse chaîne vide, ponctuation et clé 00", () => {
    expect(v("")).toBe(false);
    expect(v("CH00 0000 0000 0000 0000 0")).toBe(false);
    expect(v("CH93 0076 2011 6238 5295 !")).toBe(false);
  });
});

describe("ean13", () => {
  const v = getValidator("ean13");
  const r = rng(3);
  function withEan(body12: string): string {
    let sum = 0;
    for (let i = 0; i < 12; i++) sum += Number(body12[i]) * (i % 2 === 0 ? 1 : 3);
    return body12 + ((10 - (sum % 10)) % 10);
  }
  const valid = [
    ...Array.from({ length: 8 }, () => withEan("756" + randDigits(r, 9))), // forme AVS
    withEan("400" + randDigits(r, 9)), // autre préfixe : accepté (le préfixe est vérifié par le pack)
    withEan("000" + randDigits(r, 9)),
  ];
  it.each(valid)("accepte %s", (n) => expect(v(n)).toBe(true));
  it("accepte la présentation AVS avec points, espaces ou tirets", () => {
    const n = valid[0]!;
    const dotted = `${n.slice(0, 3)}.${n.slice(3, 7)}.${n.slice(7, 11)}.${n.slice(11)}`;
    expect(v(dotted)).toBe(true);
    expect(v(dotted.replaceAll(".", " "))).toBe(true);
    expect(v(dotted.replaceAll(".", "-"))).toBe(true);
  });
  it("accepte un exemple EAN-13 publié", () => {
    expect(v("4006381333931")).toBe(true);
  });
  const invalid = [
    ...valid.slice(0, 6).map(breakLast),
    valid[0]!.slice(0, 12), // 12 chiffres
    valid[0]! + "0", // 14 chiffres
    "756.1234.5678.9A",
    "7561234567890x",
  ];
  it.each(invalid)("refuse %s", (n) => expect(v(n)).toBe(false));
  it("refuse la chaîne vide", () => expect(v("")).toBe(false));
});

describe("fr_nir_key", () => {
  const v = getValidator("fr_nir_key");
  const r = rng(4);
  /** Clé via BigInt, avec remplacement Corse par soustraction (méthode INSEE, distincte de la source). */
  function makeNir(body13: string): string {
    let n: bigint;
    if (body13.slice(5, 7) === "2A") n = BigInt(body13.replace("2A", "20")) - 1_000_000n;
    else if (body13.slice(5, 7) === "2B") n = BigInt(body13.replace("2B", "20")) - 2_000_000n;
    else n = BigInt(body13);
    const key = 97n - (n % 97n);
    return body13 + key.toString().padStart(2, "0");
  }
  const body = (dept: string) =>
    randDigits(r, 1) + randDigits(r, 2) + randDigits(r, 2) + dept + randDigits(r, 6);
  const valid = [
    ...Array.from({ length: 6 }, () => makeNir(body("75"))),
    makeNir(body("2A")),
    makeNir(body("2A")),
    makeNir(body("2B")),
    makeNir(body("2B")),
    makeNir(body("97")), // outre-mer
  ];
  it.each(valid)("accepte %s", (n) => expect(v(n)).toBe(true));
  it("accepte espaces, points, tirets et minuscules 2a/2b", () => {
    const n = valid[0]!;
    expect(
      v(
        `${n[0]} ${n.slice(1, 3)} ${n.slice(3, 5)} ${n.slice(5, 7)} ${n.slice(7, 10)} ${n.slice(10, 13)} ${n.slice(13)}`,
      ),
    ).toBe(true);
    expect(v(group(n, 3, "-"))).toBe(true);
    expect(v(valid[6]!.toLowerCase())).toBe(true);
  });
  it("calcule la clé Corse avec 19 pour 2A et 18 pour 2B", () => {
    const a = valid[6]!;
    const asNumeric = a.slice(0, 5) + "19" + a.slice(7);
    expect(97n - (BigInt(asNumeric.slice(0, 13)) % 97n)).toBe(BigInt(a.slice(13)));
  });
  const invalid = [
    ...valid.slice(0, 8).map(breakLast),
    valid[0]!.slice(0, 14), // 14 caractères
    valid[0]! + "1", // 16 caractères
    makeNir(body("75")).slice(0, 13) + "00", // clé 00 jamais produite
    "1234567890123AB", // lettres hors département
    "31142" + "2C" + "472031" + "00",
  ];
  it.each(invalid)("refuse %s", (n) => expect(v(n)).toBe(false));
  it("refuse la chaîne vide et la clé inversée corse", () => {
    expect(v("")).toBe(false);
    // 2A traité comme 20 (sans correction) donnerait une clé différente.
    const a = valid[6]!;
    const naive = 97n - (BigInt(a.slice(0, 5) + "20" + a.slice(7, 13)) % 97n);
    expect(naive.toString().padStart(2, "0")).not.toBe(a.slice(13));
  });
});

describe("ch_uid_mod11", () => {
  const v = getValidator("ch_uid_mod11");
  const r = rng(5);
  const W = [5, 4, 3, 2, 7, 6, 5, 4];
  /** Renvoie les 9 chiffres, ou null si la clé calculée vaut 10. */
  function makeUid(body8: string): string | null {
    const sum = W.reduce((acc, w, i) => acc + w * Number(body8[i]), 0);
    const key = 11 - (sum % 11);
    if (key === 10) return null;
    return body8 + (key === 11 ? 0 : key);
  }
  function collect(count: number, wantKey10: boolean): string[] {
    const out: string[] = [];
    while (out.length < count) {
      const b = randDigits(r, 8);
      const u = makeUid(b);
      if (wantKey10 ? u === null : u !== null) out.push(wantKey10 ? b : u!);
    }
    return out;
  }
  const fmt = (d: string) => `CHE-${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  const nines = collect(12, false);
  it.each(nines)("accepte CHE-formaté pour %s", (d) => expect(v(fmt(d))).toBe(true));
  it("accepte chiffres seuls, suffixes TVA/MWST/IVA et séparateurs variés", () => {
    const d = nines[0]!;
    expect(v(d)).toBe(true);
    expect(v(`${fmt(d)} TVA`)).toBe(true);
    expect(v(`${fmt(d)} MWST`)).toBe(true);
    expect(v(`${fmt(d)} IVA`)).toBe(true);
    expect(v(`${fmt(d)}MWST`)).toBe(true);
    expect(v(`${fmt(d)} mwst`)).toBe(true);
    expect(v(`CHE ${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`)).toBe(true);
  });
  it("accepte une clé calculée à 0 (11 - 0 = 11)", () => {
    let found: string | null = null;
    for (let i = 0; i < 100000 && found === null; i++) {
      const b = String(10000000 + i);
      const u = makeUid(b);
      if (
        u !== null &&
        u.endsWith("0") &&
        W.reduce((a, w, k) => a + w * Number(b[k]), 0) % 11 === 0
      )
        found = u;
    }
    expect(found).not.toBeNull();
    expect(v(fmt(found!))).toBe(true);
  });
  it("refuse tout numéro dont la clé calculée vaudrait 10", () => {
    for (const b of collect(10, true)) {
      for (let k = 0; k < 10; k++) expect(v(fmt(b + k))).toBe(false);
    }
  });
  const invalid = [
    ...nines.slice(0, 8).map((d) => fmt(breakLast(d))),
    fmt(nines[0]!.slice(0, 8)), // 8 chiffres
    fmt(nines[0]! + "0"), // 10 chiffres
    "CHE-12A.456.789",
    "ABC-123.456.789",
    `${fmt(nines[0]!)} XYZ`,
  ];
  it.each(invalid)("refuse %s", (n) => expect(v(n)).toBe(false));
  it("refuse chaîne vide et préfixe seul", () => {
    expect(v("")).toBe(false);
    expect(v("CHE-")).toBe(false);
    expect(v("TVA")).toBe(false);
  });
});

describe("fr_siren_luhn", () => {
  const v = getValidator("fr_siren_luhn");
  const r = rng(6);
  const valid = Array.from({ length: 12 }, () => withLuhn(randDigits(r, 8)));
  it.each(valid)("accepte %s", (n) => expect(v(n)).toBe(true));
  it("accepte espaces, points et tirets", () => {
    const n = valid[0]!;
    expect(v(group(n, 3, " "))).toBe(true);
    expect(v(group(n, 3, "."))).toBe(true);
    expect(v(group(n, 3, "-"))).toBe(true);
  });
  const invalid = [
    ...valid.slice(0, 8).map(breakLast),
    valid[0]!.slice(0, 8),
    valid[0]! + "0",
    "12345678A",
    "SIREN1234",
  ];
  it.each(invalid)("refuse %s", (n) => expect(v(n)).toBe(false));
  it("refuse la chaîne vide", () => expect(v("")).toBe(false));
});

describe("fr_siret_luhn", () => {
  const v = getValidator("fr_siret_luhn");
  const r = rng(7);
  const valid = Array.from({ length: 12 }, () => withLuhn(randDigits(r, 13)));
  it.each(valid)("accepte %s", (n) => expect(v(n)).toBe(true));
  it("accepte espaces, points et tirets", () => {
    const n = valid[0]!;
    const spaced = `${n.slice(0, 3)} ${n.slice(3, 6)} ${n.slice(6, 9)} ${n.slice(9)}`;
    expect(v(spaced)).toBe(true);
    expect(v(spaced.replaceAll(" ", "."))).toBe(true);
    expect(v(spaced.replaceAll(" ", "-"))).toBe(true);
  });
  describe("exception La Poste (SIREN 356000000)", () => {
    const nics = Array.from({ length: 200 }, (_, i) => String(i * 37 + 1).padStart(5, "0"));
    const sum = (s: string) => [...s].reduce((a, c) => a + Number(c), 0);
    const multiple5 = nics.map((n) => "356000000" + n).filter((s) => sum(s) % 5 === 0);
    const notMultiple5 = nics.map((n) => "356000000" + n).filter((s) => sum(s) % 5 !== 0);
    it("accepte les numéros dont la somme des chiffres est multiple de 5", () => {
      expect(multiple5.length).toBeGreaterThanOrEqual(10);
      for (const s of multiple5.slice(0, 15)) expect(v(s)).toBe(true);
    });
    it("refuse les autres, même si Luhn les valide", () => {
      expect(notMultiple5.length).toBeGreaterThanOrEqual(10);
      for (const s of notMultiple5.slice(0, 15)) expect(v(s)).toBe(false);
      const luhnOk = notMultiple5.find((s) => withLuhn(s.slice(0, 13)) === s);
      expect(luhnOk).toBeDefined();
      expect(v(luhnOk!)).toBe(false);
    });
    it("n'applique pas l'exception à un autre SIREN", () => {
      const other = withLuhn("356000001" + "0000");
      expect(v(other)).toBe(true);
      expect(v(breakLast(other))).toBe(false);
    });
  });
  const invalid = [
    ...valid.slice(0, 8).map(breakLast),
    valid[0]!.slice(0, 13),
    valid[0]! + "0",
    "1234567890123A",
    "SIRET123456789",
  ];
  it.each(invalid)("refuse %s", (n) => expect(v(n)).toBe(false));
  it("refuse la chaîne vide", () => expect(v("")).toBe(false));
});
