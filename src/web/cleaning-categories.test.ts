import { describe, expect, it } from "vitest";
import { ENTITY_TYPES, type Detection } from "../core/index.ts";
import { ALL_CLEANING_CATEGORIES, selectCleaningDetections } from "./cleaning-categories.ts";

function det(over: Partial<Detection> = {}): Detection {
  return {
    id: "d1",
    start: 0,
    end: 10,
    entityType: "PERSON",
    score: 0.9,
    recognizerId: "ner/fictif",
    packId: "ner",
    source: "ner",
    explanation: [],
    ...over,
  };
}
const noManual = new Set<string>();

describe("choix des catégories (#26)", () => {
  it("couvre chaque type du moteur, et ne remplace rien sans sélection", () => {
    const all = ENTITY_TYPES.map((entityType, i) =>
      det({ id: `d${i}`, start: i * 20, end: i * 20 + 10, entityType }),
    );
    expect(selectCleaningDetections(all, [], ALL_CLEANING_CATEGORIES, noManual)).toEqual(all);
    expect(selectCleaningDetections(all, [], [], noManual)).toEqual([]);
  });

  it("applique Identité à toutes les sources et conserve les autres catégories", () => {
    const all = [
      det({ id: "ner" }),
      det({ id: "dict", source: "dictionary" }),
      det({ id: "prop", source: "dictionary", recognizerId: "core/name-propagation" }),
      det({ id: "date", source: "pattern", entityType: "DATE" }),
    ];
    expect(selectCleaningDetections(all, [], ["identity"], noManual).map((d) => d.id)).toEqual([
      "ner",
      "dict",
      "prop",
    ]);
    expect(selectCleaningDetections(all, [], ["dates"], noManual).map((d) => d.id)).toEqual([
      "date",
    ]);
  });

  it("distingue adresse postale entière, lieu isolé et IP", () => {
    const all = [
      det({ id: "address", entityType: "LOCATION", recognizerId: "core/address-merge" }),
      det({ id: "place", entityType: "LOCATION", start: 20, end: 30 }),
      det({ id: "ip", entityType: "IP_ADDRESS", start: 40, end: 50 }),
    ];
    expect(selectCleaningDetections(all, [], ["addresses"], noManual).map((d) => d.id)).toEqual([
      "address",
    ]);
    expect(selectCleaningDetections(all, [], ["places"], noManual).map((d) => d.id)).toEqual([
      "place",
    ]);
    expect(selectCleaningDetections(all, [], ["ip"], noManual).map((d) => d.id)).toEqual(["ip"]);
  });

  it("reconnaît encore une adresse quand le NER a gagné sur sa règle", () => {
    const ner = det({ entityType: "LOCATION", start: 3, end: 40 });
    const street = det({
      entityType: "LOCATION",
      source: "pattern",
      recognizerId: "country-ch/street-romand",
      start: 3,
      end: 25,
    });
    expect(selectCleaningDetections([ner], [street], ["addresses"], noManual)).toEqual([ner]);
    expect(selectCleaningDetections([ner], [street], ["places"], noManual)).toEqual([]);
  });

  it("ne laisse pas un fragment d’une adresse ou d’un courriel sélectionné en clair", () => {
    const full = det({ entityType: "LOCATION", recognizerId: "core/address-merge", end: 35 });
    const city = det({ id: "city", entityType: "LOCATION", start: 25, end: 35 });
    expect(selectCleaningDetections([full], [city], ["addresses"], noManual)).toEqual([full]);
    expect(selectCleaningDetections([full], [city], ["places"], noManual)).toEqual([]);
    const email = det({ entityType: "EMAIL" });
    expect(selectCleaningDetections([email], [det()], ["identity"], noManual)).toEqual([]);
  });

  it("conserve les décisions manuelles même sans catégorie sélectionnée", () => {
    const manual = det({ id: "m1", source: "manual" });
    const corrected = det({ id: "corrected" });
    expect(
      selectCleaningDetections([det(), manual, corrected], [], [], new Set(["corrected"])),
    ).toEqual([manual, corrected]);
  });
});
