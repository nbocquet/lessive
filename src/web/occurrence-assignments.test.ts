import { expect, it } from "vitest";
import { createSession, type TransformResult } from "../core/index.ts";
import { applyOccurrenceAssignments } from "./occurrence-assignments.ts";

it("recalcule toutes les positions de sortie, conserve les traces et les caractères hors remplacement", () => {
  const session = createSession();
  const person = session.resolve("Nérine Valombre", "PERSON");
  const result: TransformResult = {
    text: "😀 A et B. Épilogue",
    applied: [
      {
        detectionId: "d1",
        entityType: "PERSON",
        operator: "pseudonymize",
        originalStart: 3,
        originalEnd: 15,
        outputStart: 3,
        outputEnd: 4,
        replacement: "A",
      },
      {
        detectionId: "d2",
        entityType: "PERSON",
        operator: "pseudonymize",
        originalStart: 19,
        originalEnd: 31,
        outputStart: 8,
        outputEnd: 9,
        replacement: "B",
      },
    ],
    errors: [],
  };
  const assigned = applyOccurrenceAssignments(result, { d1: person.pseudonym }, session);
  expect(assigned.text).toBe(`😀 ${person.pseudonym} et B. Épilogue`);
  for (const a of assigned.applied) {
    expect(assigned.text.slice(a.outputStart, a.outputEnd)).toBe(a.replacement);
  }
  expect(assigned.applied[0]).toMatchObject({ originalStart: 3, originalEnd: 15 });
  expect(assigned.applied[1]).toMatchObject({ originalStart: 19, originalEnd: 31 });
  expect(result.text).toBe("😀 A et B. Épilogue");
});

it("refuse une personne disparue ou une cible d'un autre type sans citer les données", () => {
  const session = createSession();
  const email = session.resolve("contact@example.org", "EMAIL");
  const result: TransformResult = {
    text: "PERSONNE_001",
    applied: [
      {
        detectionId: "d1",
        entityType: "PERSON",
        operator: "pseudonymize",
        originalStart: 0,
        originalEnd: 7,
        outputStart: 0,
        outputEnd: 12,
        replacement: "PERSONNE_001",
      },
    ],
    errors: [],
  };
  for (const target of ["PERSONNE_999", email.pseudonym]) {
    expect(() => applyOccurrenceAssignments(result, { d1: target }, session)).toThrow(
      "Rattachement indisponible : choisissez de nouveau la personne.",
    );
  }
});
