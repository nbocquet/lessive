import { describe, expect, it } from "vitest";
import { MAX_INPUT_LENGTH, type AnalysisContext, type PatternRule } from "../types/index.ts";
import { AbortError } from "./errors.ts";
import { PatternRecognizer } from "./pattern-recognizer.ts";

function makeCtx(signal?: AbortSignal): AnalysisContext {
  let n = 0;
  return { nextId: () => `d${++n}`, signal };
}

const rule = (over: Partial<PatternRule> = {}): PatternRule => ({
  kind: "pattern",
  id: "code",
  entityType: "CH_AVS",
  score: 0.5,
  pattern: "\\b\\d{3}-\\d{3}\\b",
  ...over,
});

describe("PatternRecognizer", () => {
  it("renseigne la détection (source, score, ids, explication sans valeur)", async () => {
    const r = new PatternRecognizer(rule(), "pk");
    const text = "voir 123-456 ok";
    const [d, ...rest] = await r.analyze(text, makeCtx());
    expect(rest).toEqual([]);
    expect(r.id).toBe("pk/code");
    expect(d).toMatchObject({
      id: "d1",
      start: 5,
      end: 12,
      entityType: "CH_AVS",
      score: 0.5,
      recognizerId: "pk/code",
      packId: "pk",
      source: "pattern",
    });
    expect(d?.validated).toBeUndefined();
    expect(d?.explanation.join(" ")).not.toContain("123-456");
    expect(d?.explanation[0]).toContain("0,5");
  });

  it("donne des positions exactes après accents, emojis et caractères décomposés", async () => {
    const r = new PatternRecognizer(rule(), "pk");
    const text = "Éléonore 😀 café œuvre 123-456 fin";
    const [d] = await r.analyze(text, makeCtx());
    expect(text.slice(d?.start, d?.end)).toBe("123-456");
  });

  it("trouve plusieurs correspondances", async () => {
    const r = new PatternRecognizer(rule(), "pk");
    const ds = await r.analyze("111-222 et 333-444", makeCtx());
    expect(ds.map((d) => [d.start, d.end])).toEqual([
      [0, 7],
      [11, 18],
    ]);
    expect(new Set(ds.map((d) => d.id)).size).toBe(2);
  });

  it("applique les drapeaux autorisés", async () => {
    const r = new PatternRecognizer(rule({ pattern: "abc", flags: "i" }), "pk");
    expect(await r.analyze("xABCx", makeCtx())).toHaveLength(1);
  });

  it.each(["g", "y", "d", "v", "x", "ii"])("refuse le drapeau %s", (flags) => {
    expect(() => new PatternRecognizer(rule({ flags }), "pk")).toThrow(/drapeau/);
  });

  it("refuse une expression invalide avec un message clair", () => {
    expect(() => new PatternRecognizer(rule({ pattern: "(" }), "pk")).toThrow(/invalide/);
  });

  it("validateur réussi : score 1,0, validated, explication", async () => {
    const r = new PatternRecognizer(rule({ validator: "luhn" }), "pk", () => true);
    const [d] = await r.analyze("123-456", makeCtx());
    expect(d?.score).toBe(1);
    expect(d?.validated).toBe(true);
    expect(d?.explanation).toHaveLength(2);
    expect(d?.explanation[1]).toContain("luhn");
  });

  it("validateur échoué : détection supprimée ; il reçoit la valeur brute", async () => {
    const seen: string[] = [];
    const r = new PatternRecognizer(rule({ validator: "luhn" }), "pk", (v) => {
      seen.push(v);
      return v === "333-444";
    });
    const ds = await r.analyze("111-222 333-444", makeCtx());
    expect(seen).toEqual(["111-222", "333-444"]);
    expect(ds).toHaveLength(1);
    expect(ds[0]?.start).toBe(8);
  });

  it("refuse une règle à validateur sans validateur fourni", () => {
    expect(() => new PatternRecognizer(rule({ validator: "luhn" }), "pk", undefined)).toThrow(
      /luhn/,
    );
  });

  it("refuse un texte trop long sans le citer", async () => {
    const r = new PatternRecognizer(rule(), "pk");
    const text = "x".repeat(MAX_INPUT_LENGTH + 1);
    await expect(r.analyze(text, makeCtx())).rejects.toThrow(RangeError);
    await expect(r.analyze(text, makeCtx())).rejects.not.toThrow(/xxxx/);
    expect(await r.analyze("x".repeat(MAX_INPUT_LENGTH), makeCtx())).toEqual([]);
  });

  it("ignore les correspondances vides sans boucler", async () => {
    const r = new PatternRecognizer(rule({ pattern: "\\d*" }), "pk");
    const ds = await r.analyze("ab 12 😀 345", makeCtx());
    expect(ds.map((d) => [d.start, d.end])).toEqual([
      [3, 5],
      [9, 12],
    ]);
  });

  it("avance par point de code sur les correspondances vides avec u", async () => {
    const r = new PatternRecognizer(rule({ pattern: "x*", flags: "u" }), "pk");
    expect(await r.analyze("😀😀", makeCtx())).toEqual([]);
  });

  it("lève AbortError si le signal est déjà annulé", async () => {
    const r = new PatternRecognizer(rule(), "pk");
    const ac = new AbortController();
    ac.abort();
    await expect(r.analyze("123-456", makeCtx(ac.signal))).rejects.toBeInstanceOf(AbortError);
  });

  it("vérifie le signal entre les correspondances", async () => {
    const r = new PatternRecognizer(rule({ pattern: "a" }), "pk");
    const ac = new AbortController();
    let n = 0;
    const ctx: AnalysisContext = {
      signal: ac.signal,
      nextId: () => {
        if (++n === 10) ac.abort();
        return `d${n}`;
      },
    };
    await expect(r.analyze("a".repeat(1000), ctx)).rejects.toMatchObject({ name: "AbortError" });
    expect(n).toBeLessThan(200);
  });

  it("expose languages et supportedEntities", () => {
    const r = new PatternRecognizer(rule({ languages: ["fr"] }), "pk");
    expect(r.languages).toEqual(["fr"]);
    expect(r.supportedEntities).toEqual(["CH_AVS"]);
    expect(new PatternRecognizer(rule({ languages: "any" }), "pk").languages).toBe("any");
    expect(new PatternRecognizer(rule(), "pk").languages).toBe("any");
  });

  it("est réutilisable et sûr en concurrence", async () => {
    const r = new PatternRecognizer(rule(), "pk");
    const [a, b] = await Promise.all([
      r.analyze("111-222", makeCtx()),
      r.analyze("x 333-444", makeCtx()),
    ]);
    expect(a).toHaveLength(1);
    expect(b[0]?.start).toBe(2);
  });
});
