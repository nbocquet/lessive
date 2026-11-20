import { describe, expect, it } from "vitest";
import { ArgumentError, HELP, parseArgs } from "./args.ts";

describe("arguments du CLI", () => {
  it("lit stdin par défaut sans NER ni dates et sans filtre de langue", () => {
    expect(parseArgs([])).toEqual({
      maskDates: false,
      language: "all",
      help: false,
      version: false,
    });
  });

  it("accepte les options et le fichier dans un ordre libre", () => {
    expect(
      parseArgs([
        "--language",
        "en",
        "app.log",
        "-o",
        "result.log",
        "--mask-dates",
        "--ner",
        "./model",
      ]),
    ).toEqual({
      input: "app.log",
      output: "result.log",
      maskDates: true,
      language: "en",
      ner: "./model",
      help: false,
      version: false,
    });
    expect(parseArgs(["-", "--language", "fr"]).input).toBe("-");
    expect(parseArgs(["--output", "result.log"]).output).toBe("result.log");
    expect(parseArgs(["--", "--fichier"]).input).toBe("--fichier");
  });

  it.each([
    ["--inconnue"],
    ["a.log", "b.log"],
    ["-o"],
    ["--ner"],
    ["--language"],
    ["--language", "de"],
    ["--language", ""],
    ["--output", "--help"],
    ["--help", "--inconnue"],
    ["--version", "a", "b"],
    [""],
  ])("refuse les arguments invalides sans les recopier : %j", (...args) => {
    expect(() => parseArgs(args)).toThrow(ArgumentError);
    expect(() => parseArgs(args)).toThrow("Arguments invalides. Consultez lessive --help.");
  });

  it("reconnaît aide et version tout en validant les autres arguments", () => {
    expect(parseArgs(["--help"]).help).toBe(true);
    expect(parseArgs(["--version"]).version).toBe(true);
    expect(HELP).toContain("sans contexte entre lignes");
    expect(HELP).toContain("stdout peut contenir un résultat partiel");
  });
});
