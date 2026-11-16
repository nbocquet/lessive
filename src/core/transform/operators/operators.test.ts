import { describe, expect, it } from "vitest";
import { ENTITY_TYPES } from "../../types/index.ts";
import type { Detection, EntityType } from "../../types/index.ts";
import { createSession } from "../../mapping/session.ts";
import { ENTITY_LABELS, categoryLabel } from "../labels.ts";
import {
  categorizeOperator,
  maskOperator,
  maskValue,
  pseudonymizeOperator,
  suppressOperator,
} from "./index.ts";

function det(entityType: EntityType, id = "d1"): Detection {
  return {
    id,
    start: 0,
    end: 1,
    entityType,
    score: 1,
    recognizerId: "test",
    packId: "test",
    source: "manual",
    explanation: [],
  };
}

describe("suppress", () => {
  it("renvoie une chaîne vide", () => {
    expect(suppressOperator.apply({ value: "Claire", detection: det("PERSON") })).toBe("");
  });
});

describe("mask", () => {
  const mask = (value: string) => maskOperator.apply({ value, detection: det("PERSON") });
  it("garde le nombre de caractères visibles et les espaces", () => {
    expect(mask("Claire Martin")).toBe("****** ******");
    expect(mask("a b\tc\nd")).toBe("* *\t*\n*");
  });
  it("compte les graphèmes : accents composés, emojis", () => {
    expect(mask("Éloïse")).toBe("******");
    expect(mask("élé")).toBe("***");
    expect(mask("Zoé 👩‍👩‍👧 🇨🇭 👍🏽")).toBe("*** * * *".replace(/ /g, " "));
  });
  it("retombe sur les points de code sans Intl.Segmenter", () => {
    expect(maskValue("Éloïse Brun", null)).toBe("****** ****");
    expect(maskValue("😀 a", null)).toBe("* *");
    expect(maskValue("", null)).toBe("");
  });
});

describe("categorize", () => {
  it("donne un libellé français par type, un par EntityType", () => {
    expect(Object.keys(ENTITY_LABELS).sort()).toEqual([...ENTITY_TYPES].sort());
    const expected: Record<EntityType, string> = {
      PERSON: "[PERSONNE]",
      ORGANIZATION: "[ORGANISATION]",
      LOCATION: "[LIEU]",
      EMAIL: "[EMAIL]",
      PHONE: "[TELEPHONE]",
      URL: "[URL]",
      IP_ADDRESS: "[IP]",
      IBAN: "[IBAN]",
      CREDIT_CARD: "[CARTE]",
      SECRET: "[SECRET]",
      DATE: "[DATE]",
      CH_AVS: "[AVS]",
      CH_UID: "[IDE]",
      FR_NIR: "[NIR]",
      FR_SIREN: "[SIREN]",
      FR_SIRET: "[SIRET]",
    };
    for (const t of ENTITY_TYPES) {
      expect(categoryLabel(t)).toBe(expected[t]);
      expect(categorizeOperator.apply({ value: "x", detection: det(t) })).toBe(expected[t]);
    }
  });
});

describe("pseudonymize", () => {
  it("utilise le pseudonyme de l'entité résolue par la session", () => {
    const session = createSession();
    const apply = (value: string) =>
      pseudonymizeOperator.apply({ value, detection: det("PERSON"), session });
    expect(apply("Claire Martin")).toBe("PERSONNE_001");
    expect(apply("Mme Martin")).toBe("PERSONNE_001");
    expect(apply("Paul Durand")).toBe("PERSONNE_002");
  });
  it("échoue clairement sans session, sans citer la valeur", () => {
    expect(() => pseudonymizeOperator.apply({ value: "Claire", detection: det("PERSON") })).toThrow(
      /session/,
    );
    try {
      pseudonymizeOperator.apply({ value: "Claire", detection: det("PERSON") });
    } catch (e) {
      expect(String(e)).not.toContain("Claire");
    }
  });
});
