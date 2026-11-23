import { describe, expect, it } from "vitest";
import {
  createSession,
  transform,
  type AnalysisResult,
  type Detection,
  type EntityType,
} from "../../core/index.ts";
import type { Corrections } from "../state.svelte.ts";
import { activeOccurrences, entityGroups, mergeTargets } from "./entity-review.ts";

// Données synthétiques (R10).
const TEXT = "Nérine Valombre écrit à Nérine. Courriel : nerine.valombre@example.org.";

function det(id: string, value: string, entityType: EntityType, from = 0): Detection {
  const start = TEXT.indexOf(value, from);
  if (start < 0) throw new Error("valeur absente");
  return {
    id,
    start,
    end: start + value.length,
    entityType,
    score: 0.9,
    recognizerId: "test",
    packId: "test",
    source: "pattern",
    explanation: [],
  };
}

const D1 = det("d1", "Nérine Valombre", "PERSON");
const D2 = det("d2", "Nérine", "PERSON", 20);
const D3 = det("d3", "nerine.valombre@example.org", "EMAIL");
const ANALYSIS: AnalysisResult = { detections: [D1, D2, D3], discarded: [], warnings: [] };
const NONE: Corrections = { added: [], removedIds: [], typeOverrides: {}, operatorOverrides: {} };

describe("entityGroups", () => {
  it("renvoie une liste vide sans analyse", () => {
    expect(
      entityGroups({
        text: TEXT,
        analysis: null,
        corrections: NONE,
        detections: [],
        transformed: null,
        session: null,
        mode: "masking",
      }),
    ).toEqual([]);
  });

  it("en masquage, regroupe par type et valeur", () => {
    const groups = entityGroups({
      text: TEXT,
      analysis: ANALYSIS,
      corrections: NONE,
      detections: [D1, D2, D3],
      transformed: null,
      session: null,
      mode: "masking",
    });
    expect(groups.map((g) => [g.entityType, g.forms.map((f) => f.value)])).toEqual([
      ["PERSON", ["Nérine Valombre"]],
      ["PERSON", ["Nérine"]],
      ["EMAIL", ["nerine.valombre@example.org"]],
    ]);
    expect(groups.every((g) => g.pseudonym === null && g.sessionEntityId === null)).toBe(true);
    expect(activeOccurrences(groups)).toBe(3);
  });

  it("garde une forme retirée, case décochée, et applique le type corrigé", () => {
    const corrections: Corrections = {
      ...NONE,
      removedIds: ["d3"],
      typeOverrides: { d2: "LOCATION" },
    };
    const groups = entityGroups({
      text: TEXT,
      analysis: ANALYSIS,
      corrections,
      detections: [D1, { ...D2, entityType: "LOCATION" }],
      transformed: null,
      session: null,
      mode: "masking",
    });
    const email = groups.find((g) => g.entityType === "EMAIL");
    expect(email?.forms[0]).toMatchObject({ active: false, detectionIds: ["d3"] });
    expect(groups.find((g) => g.forms[0]?.value === "Nérine")?.entityType).toBe("LOCATION");
    expect(activeOccurrences(groups)).toBe(2);
  });

  it("en pseudonymisation, regroupe par entité de la session et propose les rattachements", () => {
    const session = createSession();
    const plan = { mode: "pseudonymization" as const, defaultOperator: "pseudonymize" as const };
    const transformed = transform(TEXT, [D1, D2, D3], plan, session);
    const groups = entityGroups({
      text: TEXT,
      analysis: ANALYSIS,
      corrections: NONE,
      detections: [D1, D2, D3],
      transformed,
      session,
      mode: "pseudonymization",
    });
    const persons = groups.filter((g) => g.entityType === "PERSON");
    expect(persons.every((g) => g.pseudonym?.startsWith("PERSONNE_"))).toBe(true);
    expect(persons.flatMap((g) => g.forms.map((f) => f.value)).sort()).toEqual([
      "Nérine",
      "Nérine Valombre",
    ]);
    const email = groups.find((g) => g.entityType === "EMAIL")!;
    expect(mergeTargets(groups, email)).toEqual([]);
    if (persons.length === 2) expect(mergeTargets(groups, persons[0]!)).toEqual([persons[1]]);
  });

  it("en pseudonymisation, rattache une forme retirée à son entité connue", () => {
    const session = createSession();
    const plan = { mode: "pseudonymization" as const, defaultOperator: "pseudonymize" as const };
    transform(TEXT, [D1, D2, D3], plan, session);
    const transformed = transform(TEXT, [D1, D2], plan, session);
    const groups = entityGroups({
      text: TEXT,
      analysis: ANALYSIS,
      corrections: { ...NONE, removedIds: ["d3"] },
      detections: [D1, D2],
      transformed,
      session,
      mode: "pseudonymization",
    });
    const email = groups.find((g) => g.entityType === "EMAIL")!;
    expect(email.pseudonym).toMatch(/_001$/);
    expect(email.forms[0]?.active).toBe(false);
  });
});
