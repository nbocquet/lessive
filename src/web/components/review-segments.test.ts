import { describe, expect, it } from "vitest";
import { buildSegments } from "./review-segments.ts";

const d = (id: string, start: number, end: number) => ({ id, start, end });

describe("buildSegments", () => {
  it("renvoie un seul segment sans détection", () => {
    expect(buildSegments(5, [])).toEqual([{ start: 0, end: 5, detectionId: null }]);
  });

  it("renvoie une liste vide pour un texte vide", () => {
    expect(buildSegments(0, [])).toEqual([]);
  });

  it("couvre tout le texte, sans trou ni recouvrement", () => {
    const segs = buildSegments(20, [d("d2", 12, 15), d("d1", 3, 8)]);
    expect(segs).toEqual([
      { start: 0, end: 3, detectionId: null },
      { start: 3, end: 8, detectionId: "d1" },
      { start: 8, end: 12, detectionId: null },
      { start: 12, end: 15, detectionId: "d2" },
      { start: 15, end: 20, detectionId: null },
    ]);
  });

  it("gère les détections en début, en fin et jointives", () => {
    const segs = buildSegments(6, [d("a", 0, 3), d("b", 3, 6)]);
    expect(segs).toEqual([
      { start: 0, end: 3, detectionId: "a" },
      { start: 3, end: 6, detectionId: "b" },
    ]);
  });

  it("ignore les détections invalides ou chevauchantes sans planter", () => {
    const segs = buildSegments(10, [
      d("ok", 2, 6),
      d("over", 4, 8),
      d("empty", 7, 7),
      d("out", 8, 99),
    ]);
    expect(segs.filter((s) => s.detectionId !== null)).toEqual([
      { start: 2, end: 6, detectionId: "ok" },
    ]);
    expect(segs.reduce((n, s) => n + (s.end - s.start), 0)).toBe(10);
  });

  it("garde les positions UTF-16 exactes autour d'un emoji", () => {
    const text = "😀 Paul 😀";
    const start = text.indexOf("Paul");
    const segs = buildSegments(text.length, [d("d1", start, start + 4)]);
    expect(text.slice(segs[1]?.start, segs[1]?.end)).toBe("Paul");
    expect(segs.map((s) => text.slice(s.start, s.end)).join("")).toBe(text);
  });
});
