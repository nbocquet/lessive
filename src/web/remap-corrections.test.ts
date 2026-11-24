import { expect, it } from "vitest";
import type { AnalysisResult, Detection } from "../core/index.ts";
import { remapCorrections } from "./remap-corrections.ts";
import type { Corrections } from "./state.svelte.ts";

const email: Detection = {
  id: "d1",
  start: 3,
  end: 19,
  entityType: "EMAIL",
  score: 0.9,
  recognizerId: "global/email",
  packId: "global",
  source: "pattern",
  explanation: [],
};
const result = (detections: Detection[], discarded: Detection[] = []): AnalysisResult => ({
  detections,
  discarded,
  warnings: [],
});
const corrections: Corrections = {
  added: [],
  removedIds: ["d1"],
  typeOverrides: { d1: "PERSON" },
  operatorOverrides: { d1: "categorize" },
};

it("transfère toutes les corrections vers le nouvel identifiant du même passage", () => {
  expect(remapCorrections(corrections, result([email]), result([{ ...email, id: "d8" }]))).toEqual({
    added: [],
    removedIds: ["d8"],
    typeOverrides: { d8: "PERSON" },
    operatorOverrides: { d8: "categorize" },
  });
});

it.each([
  { start: 4 },
  { end: 20 },
  { entityType: "URL" as const },
  { recognizerId: "other/email" },
  { packId: "other" },
  { source: "ner" as const },
])("abandonne les corrections si l'identité change : %j", (change) => {
  expect(remapCorrections(corrections, result([email]), result([{ ...email, ...change }]))).toEqual(
    {
      added: [],
      removedIds: [],
      typeOverrides: {},
      operatorOverrides: {},
    },
  );
});

it("abandonne une correction disparue sans contaminer une détection réutilisant son identifiant", () => {
  const next = result([{ ...email, start: 25, end: 40 }]);
  expect(remapCorrections(corrections, result([email]), next).removedIds).toEqual([]);
  expect(remapCorrections(corrections, null, next).typeOverrides).toEqual({});
});

it.each(["before", "after"])("abandonne les correspondances ambiguës dans %s", (side) => {
  const unique = result([email]);
  const ambiguous = result([email, { ...email, id: "d2" }]);
  const mapped = remapCorrections(
    corrections,
    side === "before" ? ambiguous : unique,
    side === "after" ? ambiguous : unique,
  );
  expect(mapped.removedIds).toEqual([]);
  expect(mapped.typeOverrides).toEqual({});
  expect(mapped.operatorOverrides).toEqual({});
});

it("suit aussi une détection passant sous le seuil ou perdant un conflit", () => {
  const discarded = result([], [{ ...email, id: "d9" }]);
  expect(remapCorrections(corrections, result([email]), discarded).removedIds).toEqual(["d9"]);
});

it("transfère les rattachements par occurrence vers la même détection seulement", () => {
  const assigned = { ...corrections, entityAssignments: { d1: "PERSONNE_002" } };
  expect(
    remapCorrections(assigned, result([email]), result([{ ...email, id: "d9" }])).entityAssignments,
  ).toEqual({ d9: "PERSONNE_002" });
  expect(
    remapCorrections(assigned, result([email]), result([{ ...email, start: 25 }]))
      .entityAssignments,
  ).toEqual({});
});

it("conserve les clés des ajouts manuels déjà décalées après une suppression", () => {
  const manual: Corrections = {
    added: [{ start: 21, end: 24, entityType: "PERSON" }],
    removedIds: [],
    typeOverrides: { m1: "LOCATION", m2: "EMAIL" },
    operatorOverrides: { m1: "categorize" },
  };
  expect(remapCorrections(manual, result([]), result([]))).toEqual({
    ...manual,
    typeOverrides: { m1: "LOCATION" },
  });
});
