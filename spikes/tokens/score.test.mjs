import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { ROOT, buildAll } from "./corpus.mjs";
import { aggregate, collect, parseResponseName, renderMarkdown, scoreResponse } from "./score.mjs";

const built = buildAll();
const rhA = { ...built.get("rh|A"), format: "A" };
const rhB = { ...built.get("rh|B"), format: "B" };

describe("parseResponseName", () => {
  it("lit texte, format et consigne (consigne avec tiret)", () => {
    expect(parseResponseName("rh-A-traduire.txt")).toEqual({ texte: "rh", format: "A", consigne: "traduire" });
    expect(parseResponseName("copro-b-traduire-sans.txt")).toEqual({
      texte: "copro",
      format: "B",
      consigne: "traduire-sans",
    });
  });
  it("refuse les noms mal formés", () => {
    for (const bad of ["rh-D-traduire.txt", "rh-A.txt", "rh_A_traduire.txt", "rh-A-traduire.md"]) {
      expect(parseResponseName(bad)).toBeNull();
    }
  });
});

describe("scoreResponse", () => {
  it("copie exacte de la source : 100 % strict et tolérant", () => {
    const s = scoreResponse(rhA.text, rhA);
    expect(s).toMatchObject({ expected: 8, strict: 8, tolerant: 8, unknown: 0, missing: [] });
  });
  it("compte séparément strict et tolérant, les manquants et les inconnus", () => {
    const answer = "PERSON_001's note, **PERSONNE_2**, ORGANISATION_001 et PERSONNE_077.";
    const s = scoreResponse(answer, rhA);
    expect(s.strict).toBe(1); // ORGANISATION_001 seul est exact
    expect(s.tolerant).toBe(3);
    expect(s.unknown).toBe(1);
    expect(s.missing).toContain("EMAIL_001");
    expect(s.missing).not.toContain("PERSONNE_002");
  });
  it("format B : crochets retirés = tolérant seulement", () => {
    const s = scoreResponse("PERSONNE_1 puis [PERSONNE_2]", rhB);
    expect(s).toMatchObject({ strict: 1, tolerant: 2 });
  });
  it("réponse sans jeton : 0 %", () => {
    expect(scoreResponse("Hello world", rhA)).toMatchObject({ strict: 0, tolerant: 0, unknown: 0 });
  });
});

describe("collect / renderMarkdown", () => {
  const tmp = mkdtempSync(join(tmpdir(), "s2-"));
  afterAll(() => rmSync(tmp, { recursive: true, force: true }));

  it("dossier absent ou vide : aucun enregistrement", () => {
    expect(collect(join(tmp, "nexiste-pas")).records).toEqual([]);
    mkdirSync(join(tmp, "vide"));
    expect(collect(join(tmp, "vide")).records).toEqual([]);
  });

  it("ignore `exemple` par défaut, `_x` et les noms invalides (signalés)", () => {
    const dir = join(tmp, "r");
    mkdirSync(join(dir, "exemple"), { recursive: true });
    mkdirSync(join(dir, "_brouillon"));
    mkdirSync(join(dir, "mon-llm"));
    writeFileSync(join(dir, "exemple", "rh-A-traduire.txt"), rhA.text);
    writeFileSync(join(dir, "_brouillon", "rh-A-traduire.txt"), rhA.text);
    writeFileSync(join(dir, "mon-llm", "rh-A-traduire.txt"), rhA.text);
    writeFileSync(join(dir, "mon-llm", "_modele.txt"), "modèle X");
    writeFileSync(join(dir, "mon-llm", "bizarre.txt"), "x");
    writeFileSync(join(dir, "mon-llm", "inconnu-A-traduire.txt"), "x");

    const r = collect(dir);
    expect(r.records.map((x) => x.file)).toEqual(["mon-llm/rh-A-traduire.txt"]);
    expect(r.ignored).toHaveLength(2);
    expect(collect(dir, { includeExemple: true }).records.map((x) => x.llm).sort()).toEqual(["exemple", "mon-llm"]);
  });

  it("le dossier réel `reponses` n'a aucune vraie réponse tant que Nico n'en a pas déposé", () => {
    const { records } = collect(join(ROOT, "reponses"));
    for (const r of records) expect(r.llm).not.toBe("exemple");
  });

  it("les réponses factices donnent un rapport avec tableau, marqué DÉMONSTRATION", () => {
    const { records, ignored } = collect(join(ROOT, "reponses"), { includeExemple: true });
    expect(records.length).toBeGreaterThanOrEqual(3);
    const md = renderMarkdown(records, ignored, { demo: true, date: new Date("2026-01-02") });
    expect(md).toContain("DÉMONSTRATION");
    expect(md).toContain("| LLM | Format | Réponses |");
    expect(md).toMatch(/\| exemple \| A \| 1 \| 8 \|/);
    expect(md).toContain("Généré le 2026-01-02");
  });

  it("agrège en pondérant par jetons", () => {
    const a = aggregate([
      { expected: 8, strict: 4, tolerant: 8, unknown: 1, variants: { case: 1 } },
      { expected: 2, strict: 2, tolerant: 1, unknown: 0, variants: { case: 2, zeros: 1 } },
    ]);
    expect(a).toEqual({ n: 2, expected: 10, strict: 6, tolerant: 9, unknown: 1, variants: { case: 3, zeros: 1 } });
  });
});
