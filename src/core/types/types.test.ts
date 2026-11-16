import { describe, expect, it } from "vitest";
import { ENTITY_PRIORITY, ENTITY_TYPES, VALIDATOR_NAMES, isEntityType } from "./index.ts";

describe("types", () => {
  it("donne une priorité à chaque type d'entité", () => {
    for (const t of ENTITY_TYPES) expect(ENTITY_PRIORITY[t]).toBeTypeOf("number");
    expect(Object.keys(ENTITY_PRIORITY).sort()).toEqual([...ENTITY_TYPES].sort());
  });

  it("reconnaît les types valides", () => {
    expect(isEntityType("PERSON")).toBe(true);
    expect(isEntityType("person")).toBe(false);
  });

  it("a une liste fermée de validateurs sans doublon", () => {
    expect(new Set(VALIDATOR_NAMES).size).toBe(VALIDATOR_NAMES.length);
  });
});
