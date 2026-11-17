import { describe, expect, it } from "vitest";
import {
  createSession,
  transform,
  type Detection,
  type TransformResult,
} from "../../core/index.ts";
import {
  buildCopyText,
  buildWarnings,
  formatDateStamp,
  noticeText,
  originalSegments,
  outputSegments,
  resultFileName,
  segmentText,
  type WarningInput,
} from "./ResultLogic.ts";

const TEXT = "Écrire à jean.test@example.org puis à marie.test@example.org.";

function email(id: string, value: string): Detection {
  const start = TEXT.indexOf(value);
  return {
    id,
    start,
    end: start + value.length,
    entityType: "EMAIL",
    score: 1,
    recognizerId: "test",
    packId: "test",
    source: "manual",
    explanation: [],
  };
}

function run(mode: "masking" | "pseudonymization"): TransformResult {
  const detections = [email("d1", "jean.test@example.org"), email("d2", "marie.test@example.org")];
  return mode === "masking"
    ? transform(TEXT, detections, { mode, defaultOperator: "mask" })
    : transform(TEXT, detections, { mode, defaultOperator: "pseudonymize" }, createSession());
}

describe("segments", () => {
  it("découpe le texte transformé en parties neutres et remplacements", () => {
    const result = run("pseudonymization");
    const segs = outputSegments(result);
    expect(segs.map((s) => s.text).join("")).toBe(result.text);
    expect(segs.filter((s) => s.marked).map((s) => s.text)).toEqual(
      result.applied.map((a) => a.replacement),
    );
    expect(segs.filter((s) => s.marked).every((s) => s.entityType === "EMAIL")).toBe(true);
  });

  it("met en évidence les valeurs d'origine côté avant", () => {
    const segs = originalSegments(TEXT, run("masking"));
    expect(segs.map((s) => s.text).join("")).toBe(TEXT);
    expect(segs.filter((s) => s.marked).map((s) => s.text)).toEqual([
      "jean.test@example.org",
      "marie.test@example.org",
    ]);
  });

  it("ne casse pas sur un texte vide, des intervalles vides, hors texte ou chevauchants", () => {
    const base = { entityType: "EMAIL", operator: "mask" } as const;
    expect(segmentText("", [])).toEqual([]);
    const segs = segmentText("abcdef", [
      { ...base, start: 1, end: 3 },
      { ...base, start: 2, end: 4 },
      { ...base, start: 5, end: 5 },
      { ...base, start: 4, end: 99 },
    ]);
    expect(segs.map((s) => s.text)).toEqual(["a", "bc", "def"]);
    expect(segs.map((s) => s.marked)).toEqual([false, true, false]);
  });

  it("garde le HTML d'un texte collé comme simple texte (aucun balisage interprété ici)", () => {
    const html = "<img src=x onerror=alert(1)> Alice";
    const segs = segmentText(html, [
      { start: 29, end: 34, entityType: "PERSON", operator: "mask" },
    ]);
    expect(segs[0]?.text).toBe("<img src=x onerror=alert(1)> ");
    expect(segs.map((s) => s.text).join("")).toBe(html);
  });
});

describe("texte à copier", () => {
  it("sans consigne, renvoie le texte tel quel", () => {
    expect(buildCopyText("PERSONNE_001 écrit.", { withNotice: false, language: "fr" })).toBe(
      "PERSONNE_001 écrit.",
    );
  });

  it("préfixe la consigne puis une ligne vide, en français ou en anglais", () => {
    const fr = buildCopyText("PERSONNE_001 écrit.", { withNotice: true, language: "fr" });
    expect(fr).toBe(`${noticeText("fr")}\n\nPERSONNE_001 écrit.`);
    expect(fr).toContain("recopie-les à l'identique");
    const en = buildCopyText("x", { withNotice: true, language: "en" });
    expect(en.startsWith(noticeText("en"))).toBe(true);
    expect(noticeText("en")).toContain("copy them exactly");
  });
});

describe("noms de fichiers", () => {
  it("date locale AAAA-MM-JJ avec zéros", () => {
    expect(formatDateStamp(new Date(2026, 0, 5))).toBe("2026-01-05");
    expect(resultFileName(new Date(2026, 10, 17))).toBe("lessive-resultat-2026-11-17.txt");
  });
});

describe("avertissements", () => {
  const base: WarningInput = {
    mode: "pseudonymization",
    detectionCount: 2,
    discardedCount: 0,
    removedCount: 0,
    analysisWarnings: [],
    transformErrors: [],
  };
  const texts = (input: WarningInput) => buildWarnings(input).map((w) => w.text);

  it("contient toujours les limites, sans le mot interdit par R6", () => {
    const all = texts(base).join(" ");
    expect(all).toContain("identification indirecte");
    expect(all).toContain("non détectée");
    expect(all).not.toMatch(/anonymis/i);
  });

  it("signale les détections écartées et supprimées, au singulier et au pluriel", () => {
    const one = texts({ ...base, discardedCount: 1, removedCount: 1 }).join(" | ");
    expect(one).toContain("1 détection écartée");
    expect(one).toContain("1 détection supprimée");
    const many = texts({ ...base, discardedCount: 3, removedCount: 2 }).join(" | ");
    expect(many).toContain("3 détections écartées");
    expect(many).toContain("2 détections supprimées");
  });

  it("reprend les avertissements d'analyse (NER) et les parties non traitées", () => {
    const out = buildWarnings({
      ...base,
      analysisWarnings: ["La reconnaissance des noms (NER) n'est pas active."],
      transformErrors: ["segment ignoré"],
    });
    expect(out.some((w) => w.kind === "analysis" && w.text.includes("NER"))).toBe(true);
    expect(out.find((w) => w.kind === "untreated")?.text).toBe(
      "Partie non traitée : segment ignoré",
    );
  });

  it("précise l'absence de réidentification en masquage et l'absence de détection", () => {
    const out = texts({ ...base, mode: "masking", detectionCount: 0 }).join(" | ");
    expect(out).toContain("ne pourra pas être réidentifiée");
    expect(out).toContain("Aucune détection retenue");
    expect(texts(base).join(" ")).not.toContain("ne pourra pas être réidentifiée");
  });
});
