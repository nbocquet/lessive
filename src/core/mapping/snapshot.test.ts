import { describe, expect, it } from "vitest";
import type { Session } from "../types/index.ts";
import { run } from "./test-helpers.ts";
import { createSession } from "./session.ts";
import type { InMemorySession } from "./session.ts";
import { restoreSession, serializeSession, SnapshotError, validateSnapshot } from "./snapshot.ts";

describe("AC-06 : même session sur plusieurs documents", () => {
  it("garde le pseudonyme d'une personne et continue la numérotation", () => {
    const s = createSession();
    const a = run(s, "Claire Martin contacte Paul Dupont.", [
      ["Claire Martin", "PERSON"],
      ["Paul Dupont", "PERSON"],
    ]);
    const b = run(s, "Claire Martin confirme avec Anne Leroy.", [
      ["Claire Martin", "PERSON"],
      ["Anne Leroy", "PERSON"],
    ]);
    expect(a).toBe("PERSONNE_001 contacte PERSONNE_002.");
    expect(b).toBe("PERSONNE_001 confirme avec PERSONNE_003.");
  });

  it("numérote séparément par type", () => {
    const s = createSession();
    run(s, "Claire Martin à Lausanne", [
      ["Claire Martin", "PERSON"],
      ["Lausanne", "LOCATION"],
    ]);
    const b = run(s, "Genève puis Lausanne, Paul Dupont", [
      ["Genève", "LOCATION"],
      ["Lausanne", "LOCATION"],
      ["Paul Dupont", "PERSON"],
    ]);
    expect(b).toBe("LIEU_002 puis LIEU_001, PERSONNE_002");
  });
});

describe("sérialisation de session", () => {
  function build(): Session {
    const s = createSession({ id: "sess-1" });
    run(s, "Claire Martin, Mme Martin, Paul Dupont, Anne Leroy, Lausanne", [
      ["Claire Martin", "PERSON"],
      ["Mme Martin", "PERSON"],
      ["Paul Dupont", "PERSON"],
      ["Anne Leroy", "PERSON"],
      ["Lausanne", "LOCATION"],
    ]);
    const id = (p: string) => s.byPseudonym(p)!.id;
    // PERSONNE_003 (Anne) fusionnée dans PERSONNE_001 : alias conservé.
    s.merge(id("PERSONNE_001"), id("PERSONNE_003"));
    return s;
  }

  it("produit un instantané versionné", () => {
    const snap = serializeSession(build());
    expect(snap.format).toBe("lessive-session");
    expect(snap.version).toBe(2);
    expect(snap.sessionId).toBe("sess-1");
    expect(snap.counters).toEqual({ PERSON: 3, LOCATION: 1 });
    expect(Object.keys(snap.aliases)).toHaveLength(1);
  });

  it("restaure pseudonymes, compteurs et alias à l'identique", () => {
    const original = build();
    const snap = serializeSession(original);
    const restored = restoreSession(JSON.parse(JSON.stringify(snap)));
    expect(restored.id).toBe("sess-1");
    expect(restored.entities()).toEqual(original.entities());
    expect(serializeSession(restored)).toEqual(snap);
    const aliasPseudonym = Object.keys(snap.aliases)[0]!;
    expect(restored.byPseudonym(aliasPseudonym)?.pseudonym).toBe("PERSONNE_001");
  });

  it("continue la numérotation après restauration", () => {
    const restored = restoreSession(serializeSession(build()));
    const t = run(restored, "Claire Martin et Zoé Petit", [
      ["Claire Martin", "PERSON"],
      ["Zoé Petit", "PERSON"],
    ]);
    // 3 a été attribué puis fusionné : le numéro n'est pas réutilisé.
    expect(t).toBe("PERSONNE_001 et PERSONNE_004");
  });

  it("l'instantané est une copie : modifier la session ne le change pas", () => {
    const s = build();
    const snap = serializeSession(s);
    s.resolve("Nouveau Nom", "PERSON");
    expect(snap.entities).toHaveLength(3);
    snap.entities[0]!.surfaceForms.push("X");
    expect(s.entities()[0]!.surfaceForms).not.toContain("X");
  });

  it("refuse une session qui n'est pas en mémoire", () => {
    const fake = { id: "x" } as unknown as Session;
    expect(() => serializeSession(fake)).toThrow(SnapshotError);
  });
});

describe("validation stricte du snapshot", () => {
  const valid = () => serializeSession(build2());
  function build2(): Session {
    const s = createSession({ id: "s" });
    s.resolve("Claire Martin", "PERSON");
    s.resolve("Paul Dupont", "PERSON");
    return s;
  }
  type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- manipulation de JSON arbitraire dans les tests
  const clone = () => JSON.parse(JSON.stringify(valid())) as Json;

  it("accepte un instantané valide", () => {
    expect(() => validateSnapshot(clone())).not.toThrow();
  });

  const cases: [string, (s: Json) => void][] = [
    ["version inconnue", (s) => (s.version = 3)],
    ["format inconnu", (s) => (s.format = "autre")],
    ["champ en trop", (s) => (s.extra = 1)],
    ["champ manquant", (s) => delete s.counters],
    ["type d'entité inconnu", (s) => (s.entities[0].entityType = "INCONNU")],
    ["id en double", (s) => (s.entities[1].id = s.entities[0].id)],
    ["pseudonyme en double", (s) => (s.entities[1].pseudonym = s.entities[0].pseudonym)],
    ["pseudonyme d'un autre type", (s) => (s.entities[0].pseudonym = "LIEU_001")],
    ["pseudonyme mal formé", (s) => (s.entities[0].pseudonym = "PERSONNE_1")],
    ["compteur trop bas", (s) => (s.counters.PERSON = 1)],
    ["compteur négatif", (s) => (s.counters.PERSON = -1)],
    ["séquence trop basse", (s) => (s.sequence = 0)],
    [
      "alias vers entité absente",
      (s) => (s.aliases.PERSONNE_009 = { target: "entity-99", forms: [], ambiguous: false }),
    ],
    [
      "alias égal à un pseudonyme vivant",
      (s) =>
        (s.aliases[s.entities[0].pseudonym] = {
          target: s.entities[1].id,
          forms: [],
          ambiguous: false,
        }),
    ],
    [
      "alias dont les formes ne sont plus dans la cible",
      (s) =>
        (s.aliases.PERSONNE_009 = {
          target: s.entities[0].id,
          forms: ["inconnu total"],
          ambiguous: false,
        }),
    ],
    ["alias au format v1 sous la version 2", (s) => (s.aliases.PERSONNE_009 = s.entities[0].id)],
    [
      "alias avec champ en trop",
      (s) =>
        (s.aliases.PERSONNE_009 = {
          target: s.entities[0].id,
          forms: [],
          ambiguous: false,
          x: 1,
        }),
    ],
    ["formes vides", (s) => (s.entities[0].surfaceForms = [])],
    ["booléen invalide", (s) => (s.entities[0].needsReview = "oui")],
  ];
  it.each(cases)("refuse : %s", (_name, mutate) => {
    const s = clone();
    mutate(s);
    expect(() => validateSnapshot(s)).toThrow(SnapshotError);
    expect(() => restoreSession(s)).toThrow(SnapshotError);
  });

  it("refuse une entrée qui n'est pas un objet", () => {
    for (const v of [null, 42, "x", []]) expect(() => validateSnapshot(v)).toThrow(SnapshotError);
  });

  it("n'inclut aucune valeur originale dans le message", () => {
    const s = clone();
    s.entities[0].entityType = "Claire Martin";
    s.entities[1].surfaceForms = [42];
    try {
      validateSnapshot(s);
      expect.unreachable();
    } catch (e) {
      expect((e as Error).message).not.toMatch(/Claire|Martin|Dupont/);
    }
  });
});

describe("fusion puis scission à travers un instantané (B1)", () => {
  function mergedSession(): Session {
    const s = createSession({ id: "b1" });
    const a = s.resolve("Claire Martin", "PERSON");
    const b = s.resolve("Paul Durand", "PERSON");
    s.resolve("P. Durand", "PERSON");
    s.merge(a.id, b.id);
    return s;
  }
  const roundTrip = (s: Session) => restoreSession(JSON.parse(JSON.stringify(serializeSession(s))));

  it("aller-retour avant scission : l'alias garde ses formes", () => {
    const s = roundTrip(mergedSession());
    const a = s.byPseudonym("PERSONNE_001")!;
    expect(s.byPseudonym("PERSONNE_002")?.id).toBe(a.id);
  });

  it("scission complète après restauration : le pseudonyme est repris", () => {
    const s = createSession({ id: "b1" });
    const a = s.resolve("Claire Martin", "PERSON");
    const b = s.resolve("Paul Durand", "PERSON");
    s.merge(a.id, b.id);
    const r = roundTrip(s);
    expect(r.split(a.id, "Paul Durand").pseudonym).toBe("PERSONNE_002");
    expect(r.byPseudonym("PERSONNE_002")?.surfaceForms).toEqual(["Paul Durand"]);
    expect(roundTrip(r).byPseudonym("PERSONNE_002")?.surfaceForms).toEqual(["Paul Durand"]);
    expect(r.resolve("Anne Petit", "PERSON").pseudonym).toBe("PERSONNE_003");
  });

  it("scission partielle : l'ambiguïté survit à la sérialisation", () => {
    const s = mergedSession();
    const a = s.byPseudonym("PERSONNE_001")!;
    s.split(a.id, "Paul Durand");
    const r = roundTrip(s) as InMemorySession;
    expect(r.byPseudonym("PERSONNE_002")).toBeUndefined();
    expect(r.isAmbiguousPseudonym("PERSONNE_002")).toBe(true);
    expect(serializeSession(r)).toEqual(serializeSession(s));
    expect(r.resolve("Zoé Petit", "PERSON").pseudonym).toBe("PERSONNE_004");
  });

  it("lit un instantané version 1 : alias résolu, scission ultérieure prudente", () => {
    const s = mergedSession();
    const snap = JSON.parse(JSON.stringify(serializeSession(s)));
    const v1 = {
      ...snap,
      version: 1,
      aliases: { PERSONNE_002: snap.aliases.PERSONNE_002.target },
    };
    expect(validateSnapshot(v1).version).toBe(2);
    const r = restoreSession(v1) as InMemorySession;
    const a = r.byPseudonym("PERSONNE_001")!;
    expect(r.byPseudonym("PERSONNE_002")?.id).toBe(a.id);
    r.split(a.id, "Paul Durand");
    expect(r.byPseudonym("PERSONNE_002")).toBeUndefined();
    expect(r.isAmbiguousPseudonym("PERSONNE_002")).toBe(true);
  });

  it("refuse un instantané v1 mal formé", () => {
    const snap = JSON.parse(JSON.stringify(serializeSession(mergedSession())));
    const v1 = { ...snap, version: 1, aliases: { PERSONNE_002: "entity-99" } };
    expect(() => validateSnapshot(v1)).toThrow(SnapshotError);
  });
});
