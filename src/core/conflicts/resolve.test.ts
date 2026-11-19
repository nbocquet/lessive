import { describe, expect, it } from "vitest";
import type { Detection, EntityType } from "../types/index.ts";
import { resolveConflicts } from "./index.ts";

let counter = 0;
function det(start: number, end: number, extra: Partial<Detection> = {}): Detection {
  counter += 1;
  return {
    id: `d${counter}`,
    start,
    end,
    entityType: "PERSON",
    score: 0.8,
    recognizerId: "test/rec",
    packId: "test",
    source: "pattern",
    explanation: [`motif (score ${extra.score ?? 0.8})`],
    ...extra,
  };
}

const ids = (ds: Detection[]) => ds.map((d) => d.id);

/** Générateur pseudo-aléatoire mulberry32 (graine fixe, pas de Math.random). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(items: readonly T[], rnd: () => number): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

function permutations<T>(items: readonly T[]): T[][] {
  if (items.length <= 1) return [[...items]];
  return items.flatMap((x, i) =>
    permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((p) => [x, ...p]),
  );
}

describe("resolveConflicts : cas de base", () => {
  it("garde tout sans conflit et trie par start", () => {
    const a = det(10, 15);
    const b = det(0, 5);
    const { kept, discarded } = resolveConflicts([a, b]);
    expect(ids(kept)).toEqual([b.id, a.id]);
    expect(discarded).toEqual([]);
  });

  it("des intervalles adjacents ne sont pas en conflit", () => {
    const a = det(0, 5);
    const b = det(5, 8);
    const { kept, discarded } = resolveConflicts([b, a]);
    expect(ids(kept)).toEqual([a.id, b.id]);
    expect(discarded).toEqual([]);
  });

  it("un seul caractère commun suffit pour un conflit", () => {
    const a = det(0, 6, { score: 0.9 });
    const b = det(5, 8, { score: 0.6 });
    const { kept, discarded } = resolveConflicts([a, b]);
    expect(ids(kept)).toEqual([a.id]);
    expect(ids(discarded)).toEqual([b.id]);
  });

  it("chevauchement partiel : le score le plus élevé gagne", () => {
    const a = det(0, 10, { score: 0.6 });
    const b = det(5, 15, { score: 0.9 });
    const { kept, discarded } = resolveConflicts([a, b]);
    expect(ids(kept)).toEqual([b.id]);
    expect(discarded[0]?.supersededBy).toBe(b.id);
    expect(discarded[0]?.explanation.at(-1)).toBe(
      "écartée au profit d'une détection PERSON : score plus élevé (0,90 contre 0,60)",
    );
  });

  it("inclusion : la plus large gagne si son score est au moins égal", () => {
    const large = det(0, 20, { score: 0.7, entityType: "LOCATION" });
    const small = det(5, 10, { score: 0.7, entityType: "EMAIL" }); // EMAIL a pourtant la priorité de type
    const { kept } = resolveConflicts([small, large]);
    expect(ids(kept)).toEqual([large.id]);
  });

  it("inclusion : la plus large perd si son score est inférieur", () => {
    const large = det(0, 20, { score: 0.6 });
    const small = det(5, 10, { score: 0.9 });
    const { kept, discarded } = resolveConflicts([large, small]);
    expect(ids(kept)).toEqual([small.id]);
    expect(ids(discarded)).toEqual([large.id]);
  });

  it("inclusion avec bornes communes (strictement plus large)", () => {
    const large = det(0, 10, { score: 0.7 });
    const small = det(0, 6, { score: 0.7, entityType: "EMAIL" });
    expect(ids(resolveConflicts([small, large]).kept)).toEqual([large.id]);
  });

  it("égalité parfaite : priorité du type d'entité", () => {
    const person = det(0, 10, { entityType: "PERSON" });
    const org = det(0, 10, { entityType: "ORGANIZATION" });
    expect(ids(resolveConflicts([org, person]).kept)).toEqual([person.id]);
  });

  it("égalité de score et de type : intervalle le plus long", () => {
    const longer = det(0, 10, { entityType: "DATE" });
    const shorter = det(3, 12, { entityType: "DATE", score: 0.8 });
    // 10 contre 9 unités, aucune ne contient l'autre
    expect(ids(resolveConflicts([shorter, longer]).kept)).toEqual([longer.id]);
  });

  it("égalité totale : recognizerId alphabétique puis id", () => {
    const x = det(0, 5, { recognizerId: "b/rec", id: "z" });
    const y = det(0, 5, { recognizerId: "a/rec", id: "y" });
    expect(ids(resolveConflicts([x, y]).kept)).toEqual(["y"]);
    const p = det(0, 5, { id: "p" });
    const q = det(0, 5, { id: "q" });
    expect(ids(resolveConflicts([q, p]).kept)).toEqual(["p"]);
  });
});

describe("resolveConflicts : manuel, validé", () => {
  it("manuel contre validé : le manuel gagne", () => {
    const manual = det(0, 5, { source: "manual", score: 0.5, packId: "manual" });
    const valid = det(0, 5, { validated: true, score: 1, entityType: "CH_AVS" });
    const { kept, discarded } = resolveConflicts([valid, manual]);
    expect(ids(kept)).toEqual([manual.id]);
    expect(discarded[0]?.explanation.at(-1)).toContain("ajout manuel prioritaire");
  });

  it("validé contre score plus haut : le validé gagne", () => {
    const valid = det(0, 10, { validated: true, score: 0.6 });
    const high = det(5, 15, { score: 0.95 });
    const { kept } = resolveConflicts([high, valid]);
    expect(ids(kept)).toEqual([valid.id]);
  });

  it("validé contre inclusion plus large : le validé gagne (règle 2 avant 3)", () => {
    const valid = det(5, 10, { validated: true, score: 0.6 });
    const large = det(0, 20, { score: 0.9 });
    expect(ids(resolveConflicts([large, valid]).kept)).toEqual([valid.id]);
  });
});

describe("resolveConflicts : chaînes de chevauchements", () => {
  // A [0,6) chevauche B [4,10), B chevauche C [8,14), A ne chevauche pas C.
  it("B le meilleur : A et C sont toutes deux écartées au profit de B", () => {
    const a = det(0, 6, { score: 0.7 });
    const b = det(4, 10, { score: 0.9 });
    const c = det(8, 14, { score: 0.7 });
    const { kept, discarded } = resolveConflicts([c, a, b]);
    expect(ids(kept)).toEqual([b.id]);
    expect(discarded.map((d) => [d.id, d.supersededBy])).toEqual([
      [a.id, b.id],
      [c.id, b.id],
    ]);
  });

  it("A le meilleur : B est écartée, donc C (qui ne gêne pas A) est gardée", () => {
    // Le perdant n'exclut personne : B est battue par A, et C n'entre en conflit
    // qu'avec B, qui n'est pas retenue. Résultat attendu : A et C.
    const a = det(0, 6, { score: 0.9 });
    const b = det(4, 10, { score: 0.8 });
    const c = det(8, 14, { score: 0.7 });
    const { kept, discarded } = resolveConflicts([b, c, a]);
    expect(ids(kept)).toEqual([a.id, c.id]);
    expect(discarded.map((d) => [d.id, d.supersededBy])).toEqual([[b.id, a.id]]);
  });

  it("supersededBy désigne la première gardée dans l'ordre du texte", () => {
    const left = det(0, 5, { score: 0.9 });
    const right = det(6, 11, { score: 0.9 });
    const wide = det(3, 9, { score: 0.6 }); // chevauche les deux, perd contre les deux
    const { discarded } = resolveConflicts([wide, right, left]);
    expect(discarded[0]?.supersededBy).toBe(left.id);
  });
});

describe("resolveConflicts : doublons, seuil, pureté", () => {
  it("doublon exact de détecteurs différents : un seul gardé, confirmation signalée", () => {
    const a = det(0, 10, { recognizerId: "pack/a", score: 0.9, entityType: "EMAIL" });
    const b = det(0, 10, { recognizerId: "pack/b", score: 0.8, entityType: "EMAIL" });
    const { kept, discarded } = resolveConflicts([b, a]);
    expect(ids(kept)).toEqual([a.id]);
    expect(kept[0]?.explanation.at(-1)).toBe("confirmée par un autre détecteur : pack/b");
    expect(ids(discarded)).toEqual([b.id]);
  });

  it("pas de mention de confirmation pour un autre type ou le même détecteur", () => {
    const a = det(0, 10, { recognizerId: "pack/a", entityType: "EMAIL" });
    const b = det(0, 10, { recognizerId: "pack/b", entityType: "URL", score: 0.7 });
    const c = det(0, 10, { recognizerId: "pack/a", entityType: "EMAIL", score: 0.7 });
    const { kept } = resolveConflicts([a, b, c]);
    expect(kept[0]?.explanation.join("|")).not.toContain("confirmée");
  });

  it("seuil : sous minScore écarté avant résolution, sauf manuel", () => {
    const low = det(0, 5, { score: 0.4 });
    const manual = det(10, 15, { score: 0.1, source: "manual" });
    const ok = det(20, 25, { score: 0.5 });
    const { kept, discarded } = resolveConflicts([low, manual, ok]);
    expect(ids(kept)).toEqual([manual.id, ok.id]);
    expect(ids(discarded)).toEqual([low.id]);
    expect(discarded[0]?.explanation.at(-1)).toContain("sous le seuil");
    expect(discarded[0]?.supersededBy).toBeUndefined();
  });

  it("un candidat sous le seuil n'écarte personne et n'est pas une confirmation", () => {
    const low = det(0, 10, { score: 0.45, recognizerId: "pack/b" });
    const ok = det(5, 12, { score: 0.5 });
    const { kept } = resolveConflicts([low, ok]);
    expect(ids(kept)).toEqual([ok.id]);
    expect(kept[0]?.explanation.join("|")).not.toContain("confirmée");
  });

  it("minScore personnalisé", () => {
    const a = det(0, 5, { score: 0.6 });
    expect(resolveConflicts([a], { minScore: 0.7 }).kept).toEqual([]);
    expect(resolveConflicts([a], { minScore: 0.6 }).kept).toHaveLength(1);
  });

  it("intervalle vide ou invalide : écarté sans casser le reste", () => {
    const empty = det(3, 3);
    const big = det(0, 10);
    const { kept, discarded } = resolveConflicts([empty, big]);
    expect(ids(kept)).toEqual([big.id]);
    expect(ids(discarded)).toEqual([empty.id]);
  });

  it("ne mute pas les entrées et renvoie des copies", () => {
    const a = det(0, 10, { score: 0.9 });
    const b = det(5, 15, { score: 0.6 });
    const c = det(20, 25);
    const input = [a, b, c];
    const snapshot = structuredClone(input);
    const { kept, discarded } = resolveConflicts(input);
    expect(input).toEqual(snapshot);
    expect(kept.every((k) => !input.includes(k))).toBe(true);
    expect(discarded.every((k) => !input.includes(k))).toBe(true);
    expect(b.supersededBy).toBeUndefined();
    expect(discarded[0]?.explanation).toHaveLength(b.explanation.length + 1);
  });

  it("l'explication ne contient pas de valeur et se termine par la raison", () => {
    const a = det(0, 10, { score: 0.9, entityType: "IBAN" });
    const b = det(5, 15, { score: 0.6 });
    const line = resolveConflicts([a, b]).discarded[0]?.explanation.at(-1);
    expect(line).toMatch(/^écartée au profit d'une détection IBAN : /);
  });
});

describe("resolveConflicts : déterminisme", () => {
  /** Empreinte complète du résultat (ids, supersededBy, explications). */
  const fingerprint = (input: Detection[]) => JSON.stringify(resolveConflicts(input));

  it("identique pour les 720 permutations de 6 détections (dont un cycle non transitif)", () => {
    // Cycle par paires : A contient B à score égal (A gagne), B bat C par priorité
    // de type, C bat A par priorité de type. Un tri naïf dépendrait de l'ordre.
    const A = det(0, 10, { entityType: "LOCATION", score: 0.7, id: "A" });
    const B = det(2, 6, { entityType: "EMAIL", score: 0.7, id: "B" });
    const C = det(5, 12, { entityType: "PERSON", score: 0.7, id: "C" });
    const D = det(11, 16, { entityType: "DATE", score: 0.7, id: "D" });
    const E = det(11, 16, { entityType: "DATE", score: 0.7, id: "E", recognizerId: "test/other" });
    const F = det(20, 25, { entityType: "PHONE", score: 0.9, id: "F", validated: true });
    const base = [A, B, C, D, E, F];
    const expected = fingerprint(base);
    const perms = permutations(base);
    expect(perms).toHaveLength(720);
    for (const p of perms) expect(fingerprint(p)).toBe(expected);
  });

  it("identique pour des ordres aléatoires sur de grands ensembles (graine fixe)", () => {
    const types: EntityType[] = ["PERSON", "EMAIL", "DATE", "LOCATION", "PHONE", "IBAN"];
    for (const seed of [1, 2, 3]) {
      const rnd = mulberry32(seed);
      const set: Detection[] = [];
      for (let i = 0; i < 300; i++) {
        const start = Math.floor(rnd() * 400);
        const len = 1 + Math.floor(rnd() * 12);
        set.push(
          det(start, start + len, {
            id: `s${seed}-${i}`,
            entityType: types[Math.floor(rnd() * types.length)]!,
            score: [0.5, 0.7, 0.9][Math.floor(rnd() * 3)]!, // peu de valeurs : beaucoup d'égalités
            validated: rnd() < 0.1 ? true : undefined,
            recognizerId: `r/${Math.floor(rnd() * 3)}`,
          }),
        );
      }
      const expected = fingerprint(set);
      for (let k = 0; k < 40; k++) expect(fingerprint(shuffle(set, rnd))).toBe(expected);
    }
  });

  it("le résultat est cohérent : gardées disjointes et triées, tout écart justifié", () => {
    const rnd = mulberry32(42);
    const set = Array.from({ length: 500 }, (_, i) => {
      const start = Math.floor(rnd() * 600);
      return det(start, start + 1 + Math.floor(rnd() * 10), {
        id: `c${i}`,
        score: 0.5 + rnd() / 2,
      });
    });
    const { kept, discarded } = resolveConflicts(set);
    expect(kept.length + discarded.length).toBe(set.length);
    for (let i = 1; i < kept.length; i++)
      expect(kept[i]!.start).toBeGreaterThanOrEqual(kept[i - 1]!.end);
    const keptIds = new Set(ids(kept));
    for (const d of discarded) {
      expect(keptIds.has(d.supersededBy!)).toBe(true);
      const w = kept.find((k) => k.id === d.supersededBy)!;
      expect(w.start < d.end && d.start < w.end).toBe(true);
    }
  });
});

describe("resolveConflicts : performance", () => {
  it("traite 10 000 détections aléatoires en moins d'une seconde", () => {
    const rnd = mulberry32(2024);
    const set = Array.from({ length: 10_000 }, (_, i) => {
      const start = Math.floor(rnd() * 100_000);
      return det(start, start + 1 + Math.floor(rnd() * 30), {
        id: `p${i}`,
        score: 0.5 + rnd() / 2,
      });
    });
    const t0 = performance.now();
    const { kept, discarded } = resolveConflicts(set);
    const elapsed = performance.now() - t0;
    expect(kept.length + discarded.length).toBe(10_000);
    expect(elapsed).toBeLessThan(1000);
  });
});

describe("unités protégées (e-mail, adresse réunie)", () => {
  const email = (s: number, e: number) =>
    det(s, e, { entityType: "EMAIL", score: 0.9, recognizerId: "global/email" });

  it("un fragment plus confiant contenu dans un e-mail est écarté", () => {
    const mail = email(0, 24);
    const frag = det(0, 6, { source: "ner", score: 0.99 });
    const { kept, discarded } = resolveConflicts([frag, mail]);
    expect(ids(kept)).toEqual([mail.id]);
    expect(discarded[0]!.supersededBy).toBe(mail.id);
  });

  it("une adresse réunie résiste à plusieurs fragments NER, même avec un score intermédiaire", () => {
    const addr = det(0, 40, {
      entityType: "LOCATION",
      score: 0.95,
      recognizerId: "core/address-merge",
    });
    const fragments = [
      det(0, 22, { entityType: "LOCATION", source: "ner", score: 0.9379 }),
      det(30, 40, { entityType: "LOCATION", source: "ner", score: 0.9964 }),
      det(50, 60, { entityType: "PERSON", source: "ner", score: 0.97 }),
    ];
    const { kept } = resolveConflicts([...fragments, addr]);
    expect(kept.map((d) => [d.start, d.end])).toEqual([
      [0, 40],
      [50, 60],
    ]);
  });

  it("un ajout manuel dans l'unité reste prioritaire", () => {
    const mail = email(0, 24);
    const manual = det(0, 6, { source: "manual", score: 1 });
    const { kept } = resolveConflicts([mail, manual]);
    expect(ids(kept)).toEqual([manual.id]);
  });

  it("une adresse battue par un ajout manuel ne supprime pas la ville voisine", () => {
    const text = "18 rue des Mélèzes, 1205 Genève";
    const address = det(0, text.length, {
      entityType: "LOCATION",
      recognizerId: "core/address-merge",
      score: 0.95,
    });
    const manual = det(0, text.indexOf(","), { source: "manual", score: 1 });
    const city = det(text.indexOf("Genève"), text.length, {
      entityType: "LOCATION",
      source: "ner",
      score: 0.99,
    });
    for (const input of permutations([address, manual, city])) {
      const { kept, discarded } = resolveConflicts(input, { text });
      expect(ids(kept)).toEqual([manual.id, city.id]);
      expect(discarded.map((d) => [d.id, d.supersededBy])).toEqual([[address.id, manual.id]]);
    }
  });

  it("seuls les ajouts manuels retenus désactivent une unité protégée", () => {
    const winner = det(0, 10, { source: "manual", score: 1 });
    const loser = det(5, 20, { source: "manual", score: 0.8 });
    const mail = email(15, 35);
    const fragment = det(25, 30, { source: "ner", score: 0.99 });
    for (const input of permutations([winner, loser, mail, fragment])) {
      expect(ids(resolveConflicts(input).kept)).toEqual([winner.id, mail.id]);
    }
  });

  describe("chevauchement partiel d'une unité", () => {
    const addrText = "7 avenue du Léman, 74100 Annemasse, France";
    const addr = () =>
      det(0, 34, { entityType: "LOCATION", score: 0.95, recognizerId: "core/address-merge" });
    const ner = (s: number, e: number, entityType: EntityType = "LOCATION") =>
      det(s, e, { entityType, source: "ner", score: 0.99 });
    const span = (ds: Detection[]) => ds.map((d) => [d.start, d.end]);

    it("adresse postale : la partie extérieure d'une détection qui déborde est gardée", () => {
      const input = [ner(12, 17), ner(25, 42), addr()];
      const { kept, discarded } = resolveConflicts(input, { text: addrText });
      expect(span(kept)).toEqual([
        [0, 34],
        [36, 42],
      ]);
      expect(addrText.slice(36, 42)).toBe("France");
      expect(kept[1]!.explanation.join(" ")).toContain("rognée");
      expect(discarded.map((d) => d.start)).toEqual([12]);
    });

    it("e-mail : le débordement est rogné à gauche, le fragment interne écarté", () => {
      const text = "Contact Nina Morel@x elodie.morel@example.org fin";
      const s = text.indexOf("elodie");
      const mail = email(s, s + 24);
      const over = ner(s - 6, s + 6, "PERSON");
      const inner = ner(s + 7, s + 12, "PERSON");
      const { kept } = resolveConflicts([over, inner, mail], { text });
      expect(span(kept)).toEqual([
        [s - 6, s - 1],
        [s, s + 24],
      ]);
    });

    it.each([
      ["+41 22 123 45 67", "41 22 123 45 67", "+41 22 123 45 67"],
      ["S.A.", "S.A.", "S.A"],
      ["(Dupont", "Dupont", "(Dupont"],
    ])("le rognage conserve la ponctuation du bord intact : %s", (value, cutLeft, cutRight) => {
      for (const source of ["ner", "dictionary"] as const) {
        for (const before of [false, true]) {
          const text = before ? `${value}, a@example.org` : `a@example.org, ${value}`;
          const mailStart = text.indexOf("a@example.org");
          const valueStart = text.indexOf(value);
          const mail = email(mailStart, mailStart + "a@example.org".length);
          const over = det(before ? 0 : 2, before ? mailStart + 1 : text.length, {
            source,
            score: 0.99,
          });
          const { kept } = resolveConflicts([over, mail], { text });
          const trimmed = kept.find((d) => d.id === over.id)!;
          // Le bord coupé est resserré ; seule la ponctuation du bord intact est conservée.
          const expected = before ? cutRight : cutLeft;
          expect(text.slice(trimmed.start, trimmed.end)).toBe(expected);
          expect(before ? trimmed.start : trimmed.end).toBe(
            before ? valueStart : valueStart + value.length,
          );
          expect([over.start, over.end]).toEqual([
            before ? 0 : 2,
            before ? mailStart + 1 : text.length,
          ]);
        }
      }
    });

    it.each([
      { source: "pattern", validated: true },
      { source: "pattern", validated: false },
      { source: "ner", validated: true },
      { source: "dictionary", validated: true },
    ] as const)(
      "rogne aussi un motif ou une détection validée, sans la validation : %j",
      (metadata) => {
        const value = "+41 22 123 45 67";
        for (const before of [false, true]) {
          const text = before ? `${value}, a@example.org` : `a@example.org, ${value}`;
          const mailStart = text.indexOf("a@example.org");
          const valueStart = text.indexOf(value);
          const mail = email(mailStart, mailStart + "a@example.org".length);
          const over = det(before ? 0 : 2, before ? mailStart + 1 : text.length, {
            ...metadata,
            entityType: "PHONE",
            score: 1,
          });
          const { kept, discarded } = resolveConflicts([over, mail], { text });
          expect(discarded).toEqual([]);
          const trimmed = kept.find((d) => d.id === over.id)!;
          // La partie extérieure reste couverte : la laisser en clair serait une fuite.
          // Seul le bord coupé est resserré (le « + » tombe si la coupe est à gauche).
          expect(text.slice(trimmed.start, trimmed.end)).toBe(before ? value : value.slice(1));
          expect(before ? trimmed.start : trimmed.end).toBe(
            before ? valueStart : valueStart + value.length,
          );
          expect(trimmed.validated).toBe(false);
          expect(trimmed.explanation.includes("validation retirée : la valeur a été coupée")).toBe(
            metadata.validated,
          );
          expect(trimmed.explanation.at(-1)).toContain("rognée");
          expect(over.validated).toBe(metadata.validated);
        }
      },
    );

    it.each(["Rene\u0301", "Rene\u0301\u0327", "𐐀Rene\u0301", "Rene\u{1D165}", "𐐀"])(
      "le nom rogné conserve ses marques combinantes : %s",
      (name) => {
        for (const before of [false, true]) {
          const text = before ? `${name}, a@example.org` : `a@example.org, ${name}`;
          const mailStart = text.indexOf("a@example.org");
          const nameStart = text.indexOf(name);
          const mail = email(mailStart, mailStart + "a@example.org".length);
          const over = before
            ? ner(0, mailStart + 1, "PERSON")
            : ner(mailStart + 2, text.length, "PERSON");
          const { kept } = resolveConflicts([over, mail], { text });
          const person = kept.find((d) => d.id === over.id)!;
          expect([person.start, person.end]).toEqual([nameStart, nameStart + name.length]);
          expect(text.slice(person.start, person.end)).toBe(name);
        }
      },
    );

    it("sans texte, ou coupe au milieu d'un mot, ou sans lettre restante : écartée", () => {
      const mail = email(13, 37);
      const over = ner(7, 19, "PERSON");
      expect(span(resolveConflicts([over, mail]).kept)).toEqual([[13, 37]]);
      const mid = "abcdefghijklmnopqrstuvwxyzabcdefghijklmnop";
      expect(span(resolveConflicts([over, mail], { text: mid }).kept)).toEqual([[13, 37]]);
      const blank = "      , ".padEnd(13, " ") + "x".repeat(24);
      expect(span(resolveConflicts([over, mail], { text: blank }).kept)).toEqual([[13, 37]]);
    });

    it("résultat identique pour toute permutation, avec deux unités qui se chevauchent", () => {
      const text = "x ".repeat(30);
      const input = [
        email(2, 20),
        email(10, 30),
        ner(0, 12, "PERSON"),
        ner(18, 40, "PERSON"),
        ner(14, 16, "PERSON"),
      ];
      const norm = (ds: Detection[]) => span(resolveConflicts(ds, { text }).kept);
      const a = norm(input);
      expect(norm([...input].reverse())).toEqual(a);
      expect(norm([input[3]!, input[0]!, input[4]!, input[2]!, input[1]!])).toEqual(a);
    });

    it("un ajout manuel qui chevauche partiellement l'unité reste prioritaire (comportement fixé)", () => {
      const mail = email(13, 37);
      const manual = det(7, 19, { source: "manual", score: 1 });
      expect(span(resolveConflicts([mail, manual]).kept)).toEqual([[7, 19]]);
    });
  });

  it("un nom affiché voisin n'est pas touché", () => {
    const name = det(0, 12, { source: "ner", score: 0.99 });
    const mail = email(14, 38);
    expect(ids(resolveConflicts([mail, name]).kept)).toEqual([name.id, mail.id]);
  });
});

describe("unités protégées : lien vers la détection finalement retenue", () => {
  it("rattache le fragment et l'e-mail à l'URL retenue, indépendamment de l'ordre d'entrée", () => {
    const text = "voir https://example.org/a/jean@example.org/b";
    const emailStart = text.indexOf("jean");
    const url = det(5, text.length, { entityType: "URL", score: 0.95 });
    const email = det(emailStart, emailStart + "jean@example.org".length, {
      entityType: "EMAIL",
      score: 0.9,
    });
    const fragment = det(emailStart, emailStart + 4, { source: "ner", score: 0.99 });
    const input = [url, email, fragment];
    const original = structuredClone(input);

    for (const order of permutations(input)) {
      const { kept, discarded } = resolveConflicts(order, { text });
      expect(ids(kept)).toEqual([url.id]);
      expect(discarded).toHaveLength(2);
      expect(discarded.every((d) => d.supersededBy === url.id)).toBe(true);
      const discardedFragment = discarded.find((d) => d.id === fragment.id)!;
      expect(discardedFragment.explanation.at(-1)).toBe(
        "décision intermédiaire révisée : détection finalement retenue URL",
      );
      expect(discardedFragment.explanation.join(" ")).not.toContain("jean");
      expect(discardedFragment.explanation.join(" ")).not.toContain("example.org");
    }
    expect(input).toEqual(original);
  });

  it("conserve le lien et l'explication directe quand l'e-mail est retenu", () => {
    const email = det(0, 16, { entityType: "EMAIL", score: 0.9 });
    const fragment = det(0, 4, { source: "ner", score: 0.99 });
    const { discarded } = resolveConflicts([fragment, email]);
    expect(discarded[0]!.supersededBy).toBe(email.id);
    expect(discarded[0]!.explanation.at(-1)).toContain("unité protégée");
    expect(discarded[0]!.explanation).toHaveLength(fragment.explanation.length + 1);
  });
});
