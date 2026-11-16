import { describe, expect, it } from "vitest";
import type { Detection, PatternRule } from "../types/index.ts";
import { applyContext } from "./apply-context.ts";

const mkRule = (context: PatternRule["context"]): PatternRule => ({
  kind: "pattern",
  id: "r",
  entityType: "FR_SIREN",
  score: 0.5,
  pattern: "\\d{9}",
  context,
});

function det(text: string, value: string, over: Partial<Detection> = {}): Detection {
  const start = text.indexOf(value);
  return {
    id: "d1",
    start,
    end: start + value.length,
    entityType: "FR_SIREN",
    score: 0.5,
    recognizerId: "pk/r",
    packId: "pk",
    source: "pattern",
    explanation: ["motif « r » (score 0,5)"],
    ...over,
  };
}

const rules = (r: PatternRule) => new Map([["pk/r", r]]);

describe("applyContext", () => {
  const ctx = { words: { fr: ["siren"], en: ["company"], any: ["ref"] } };

  it("rehausse de 0,35 et trace dans l'explication", () => {
    const text = "Le SIREN est 123456789 ok";
    const d = det(text, "123456789");
    const { detections, dropped } = applyContext(text, [d], rules(mkRule(ctx)), "fr");
    expect(dropped).toEqual([]);
    expect(detections[0]?.score).toBeCloseTo(0.85);
    expect(detections[0]?.contextBoost).toBeCloseTo(0.35);
    expect(detections[0]?.explanation).toHaveLength(2);
    expect(detections[0]?.explanation[1]).toContain("contexte");
    expect(detections[0]?.explanation.join(" ")).not.toContain("123456789");
  });

  it("ne modifie pas l'entrée (pureté) et conserve l'ordre", () => {
    const text = "siren 123456789";
    const d = det(text, "123456789");
    const copy = structuredClone(d);
    const other = det(text, "siren", { id: "d0", recognizerId: "pk/none" });
    const out = applyContext(text, [d, other], rules(mkRule(ctx)), "fr");
    expect(d).toEqual(copy);
    expect(out.detections.map((x) => x.id)).toEqual(["d1", "d0"]);
    expect(out.detections[1]).toBe(other);
  });

  it("plafonne à 1,0 et renseigne la hausse effective", () => {
    const text = "siren 123456789";
    const d = det(text, "123456789", { score: 0.8 });
    const [r] = applyContext(text, [d], rules(mkRule(ctx)), "fr").detections;
    expect(r?.score).toBe(1);
    expect(r?.contextBoost).toBeCloseTo(0.2);
  });

  it("garde 1,0 pour une détection validée", () => {
    const text = "siren 123456789";
    const d = det(text, "123456789", { score: 1, validated: true });
    const [r] = applyContext(text, [d], rules(mkRule(ctx)), "fr").detections;
    expect(r?.score).toBe(1);
    expect(r?.validated).toBe(true);
    expect(r?.contextBoost).toBe(0);
  });

  it("fenêtre : mot à 5 mots avant oui, à 6 non", () => {
    const five = "siren un deux trois quatre cinq 123456789";
    // « siren » est le 5e mot avant ? mots avant : cinq(1) quatre(2) trois(3) deux(4) un(5) siren(6)
    const t5 = "siren un deux trois quatre 123456789";
    const r5 = applyContext(t5, [det(t5, "123456789")], rules(mkRule(ctx)), "fr");
    expect(r5.detections[0]?.contextBoost).toBeCloseTo(0.35);
    const r6 = applyContext(five, [det(five, "123456789")], rules(mkRule(ctx)), "fr");
    expect(r6.detections[0]?.contextBoost).toBeUndefined();
  });

  it("fenêtre : mot à 5 mots après oui, à 6 non", () => {
    const t5 = "123456789 un deux trois quatre siren";
    expect(
      applyContext(t5, [det(t5, "123456789")], rules(mkRule(ctx)), "fr").detections[0]?.score,
    ).toBeCloseTo(0.85);
    const t6 = "123456789 un deux trois quatre cinq siren";
    expect(
      applyContext(t6, [det(t6, "123456789")], rules(mkRule(ctx)), "fr").detections[0]?.score,
    ).toBe(0.5);
  });

  it("insensible à la casse et aux accents, mots et expressions", () => {
    const c = { words: { fr: ["numéro de sécurité", "Évaluation"] } };
    const t1 = "NUMERO DE SECURITE : 123456789";
    expect(
      applyContext(t1, [det(t1, "123456789")], rules(mkRule(c)), "fr").detections[0]?.score,
    ).toBeCloseTo(0.85);
    const t2 = "evaluation 123456789";
    expect(
      applyContext(t2, [det(t2, "123456789")], rules(mkRule(c)), "fr").detections[0]?.score,
    ).toBeCloseTo(0.85);
    // l'expression doit être entière et consécutive
    const t3 = "numéro de 123456789 sécurité";
    expect(
      applyContext(t3, [det(t3, "123456789")], rules(mkRule(c)), "fr").detections[0]?.score,
    ).toBe(0.5);
  });

  it("ne trouve pas un mot de contexte à l'intérieur d'un autre mot", () => {
    const t = "sirenne 123456789";
    expect(
      applyContext(t, [det(t, "123456789")], rules(mkRule(ctx)), "fr").detections[0]?.score,
    ).toBe(0.5);
  });

  it("utilise la langue d'analyse et `any`, pas les autres langues", () => {
    const t = "company 123456789";
    expect(
      applyContext(t, [det(t, "123456789")], rules(mkRule(ctx)), "fr").detections[0]?.score,
    ).toBe(0.5);
    expect(
      applyContext(t, [det(t, "123456789")], rules(mkRule(ctx)), "en").detections[0]?.score,
    ).toBeCloseTo(0.85);
    const t2 = "ref 123456789";
    expect(
      applyContext(t2, [det(t2, "123456789")], rules(mkRule(ctx)), "fr").detections[0]?.score,
    ).toBeCloseTo(0.85);
  });

  it("langue inconnue : toutes les langues", () => {
    const t = "company 123456789";
    expect(
      applyContext(t, [det(t, "123456789")], rules(mkRule(ctx)), undefined).detections[0]?.score,
    ).toBeCloseTo(0.85);
  });

  it("required : supprime et renvoie à part si aucun mot", () => {
    const t = "rien ici 123456789";
    const d = det(t, "123456789");
    const out = applyContext(t, [d], rules(mkRule({ ...ctx, required: true })), "fr");
    expect(out.detections).toEqual([]);
    expect(out.dropped).toHaveLength(1);
    expect(out.dropped[0]?.id).toBe("d1");
    expect(out.dropped[0]?.explanation.join(" ")).not.toContain("123456789");
  });

  it("required : garde si un mot est trouvé", () => {
    const t = "siren 123456789";
    const out = applyContext(
      t,
      [det(t, "123456789")],
      rules(mkRule({ ...ctx, required: true })),
      "fr",
    );
    expect(out.detections).toHaveLength(1);
    expect(out.dropped).toEqual([]);
  });

  it("required s'applique aussi à une détection validée", () => {
    const t = "rien 123456789";
    const d = det(t, "123456789", { score: 1, validated: true });
    const out = applyContext(t, [d], rules(mkRule({ ...ctx, required: true })), "fr");
    expect(out.dropped).toHaveLength(1);
  });

  it("sans required, une détection sans mot est inchangée", () => {
    const t = "rien 123456789";
    const d = det(t, "123456789");
    expect(applyContext(t, [d], rules(mkRule(ctx)), "fr").detections[0]).toBe(d);
  });

  it("ne compte pas les mots situés dans l'intervalle détecté", () => {
    const t = "siren 123456789";
    const d = det(t, "siren 123456789");
    expect(applyContext(t, [d], rules(mkRule(ctx)), "fr").detections[0]?.score).toBe(0.5);
  });

  it("positions correctes avec accents, emojis et décomposés avant la détection", () => {
    const t = "😀 Éléonore café SIREN : 123456789";
    const out = applyContext(t, [det(t, "123456789")], rules(mkRule(ctx)), "fr");
    expect(out.detections[0]?.score).toBeCloseTo(0.85);
  });

  it("accepte un objet comme table de règles ; règle inconnue = inchangée", () => {
    const t = "siren 123456789";
    const d = det(t, "123456789");
    expect(applyContext(t, [d], { "pk/r": mkRule(ctx) }, "fr").detections[0]?.score).toBeCloseTo(
      0.85,
    );
    expect(applyContext(t, [d], {}, "fr").detections[0]).toBe(d);
    expect(applyContext(t, [d], new Map(), "fr").detections[0]).toBe(d);
  });

  it("est déterministe", () => {
    const t = "siren 123456789 et ref 987654321";
    const ds = [det(t, "123456789"), det(t, "987654321", { id: "d2" })];
    const a = applyContext(t, ds, rules(mkRule(ctx)), "fr");
    const b = applyContext(t, ds, rules(mkRule(ctx)), "fr");
    expect(a).toEqual(b);
  });
});
