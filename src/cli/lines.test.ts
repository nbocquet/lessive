import { describe, expect, it } from "vitest";
import { MAX_INPUT_LENGTH } from "../core/types/index.ts";
import { LineError, readLines } from "./lines.ts";

async function* chunks(...values: (string | Uint8Array)[]) {
  for (const value of values) {
    yield typeof value === "string" ? new TextEncoder().encode(value) : value;
  }
}

async function collect(...values: (string | Uint8Array)[]) {
  return collectLines(chunks(...values));
}

async function collectLines(input: AsyncIterable<Uint8Array>) {
  const lines = [];
  for await (const line of readLines(input)) lines.push(line);
  return lines;
}

describe("readLines", () => {
  it("préserve les séparateurs, les lignes vides et le CR isolé", async () => {
    expect(await collect("\nalpha\r", "\n\r\nbêta\rgamma\nfin\r")).toEqual([
      { text: "", separator: "\n", bom: "", lineNumber: 1 },
      { text: "alpha", separator: "\r\n", bom: "", lineNumber: 2 },
      { text: "", separator: "\r\n", bom: "", lineNumber: 3 },
      { text: "bêta\rgamma", separator: "\n", bom: "", lineNumber: 4 },
      { text: "fin\r", separator: "", bom: "", lineNumber: 5 },
    ]);
  });

  it("accepte une entrée vide sans ajouter de ligne finale", async () => {
    expect(await collect()).toEqual([]);
    expect(await collect("", "")).toEqual([]);
    expect(await collect("\n")).toHaveLength(1);
  });

  it("reconstruit BOM, accents décomposés et emojis à chaque frontière d'octets", async () => {
    const original = "\uFEFFe\u0301😊\r\n\uFEFFfin";
    const bytes = new TextEncoder().encode(original);
    for (let cut = 0; cut <= bytes.length; cut++) {
      const lines = await collect(bytes.subarray(0, cut), bytes.subarray(cut));
      expect(lines).toEqual([
        { text: "e\u0301😊", separator: "\r\n", bom: "\uFEFF", lineNumber: 1 },
        { text: "\uFEFFfin", separator: "", bom: "", lineNumber: 2 },
      ]);
      expect(lines.map((line) => line.bom + line.text + line.separator).join("")).toBe(original);
    }
    expect(await collect(...Array.from(bytes, (byte) => new Uint8Array([byte])))).toHaveLength(2);
  });

  it("conserve un BOM seul et un BOM avant une ligne vide", async () => {
    expect(await collect("\uFEFF")).toEqual([
      { text: "", separator: "", bom: "\uFEFF", lineNumber: 1 },
    ]);
    expect(await collect("\uFEFF\n")).toEqual([
      { text: "", separator: "\n", bom: "\uFEFF", lineNumber: 1 },
    ]);
    expect(await collect("\n", "\uFEFFfin")).toEqual([
      { text: "", separator: "\n", bom: "", lineNumber: 1 },
      { text: "\uFEFFfin", separator: "", bom: "", lineNumber: 2 },
    ]);
  });

  it.each(["", "\n", "\r\n"])("accepte exactement la limite avant %j", async (ending) => {
    const text = "😊".repeat(MAX_INPUT_LENGTH / 2);
    const lines = await collect("\uFEFF", text, ...Array.from(ending));
    expect(lines).toEqual([{ text, separator: ending, bom: "\uFEFF", lineNumber: 1 }]);
  });

  it("rejette le dépassement sans attendre la fin de la ligne", async () => {
    let reads = 0;
    async function* input() {
      reads++;
      yield new TextEncoder().encode("x".repeat(MAX_INPUT_LENGTH + 1));
      reads++;
      yield new TextEncoder().encode("\n");
    }
    await expect(collectLines(input())).rejects.toMatchObject({
      code: "LINE_TOO_LONG",
      lineNumber: 1,
    });
    expect(reads).toBe(1);
  });

  it.each(["", "x", "\r\n"])(
    "rejette un CR excédentaire devenu contenu avant %j",
    async (suffix) => {
      await expect(collect("x".repeat(MAX_INPUT_LENGTH), "\r", suffix)).rejects.toMatchObject({
        code: "LINE_TOO_LONG",
        lineNumber: 1,
      });
    },
  );

  it.each([
    [0xff],
    [0xc0, 0xaf],
    [0xed, 0xa0, 0x80],
    [0xf4, 0x90, 0x80, 0x80],
    [0xe2, 0x82],
    [0xe2, 0x0a],
  ])("refuse l'UTF-8 invalide %j sans exposer le contenu", async (...bytes) => {
    const iterator = readLines(chunks("correct\n", "SENSIBLE", new Uint8Array(bytes)));
    expect((await iterator.next()).value?.lineNumber).toBe(1);
    const result = iterator.next();
    await expect(result).rejects.toBeInstanceOf(LineError);
    await expect(result).rejects.toMatchObject({ code: "UTF8", lineNumber: 2 });
    await expect(result).rejects.not.toThrow("SENSIBLE");
  });

  it("émet le préfixe valide avant une erreur UTF-8 dans le même bloc", async () => {
    const iterator = readLines(chunks(new Uint8Array([0x61, 0x0a, 0xff])));
    expect((await iterator.next()).value?.text).toBe("a");
    await expect(iterator.next()).rejects.toMatchObject({ code: "UTF8", lineNumber: 2 });
  });

  it("attend le consommateur sans lire les blocs suivants ni accumuler leurs lignes", async () => {
    let reads = 0;
    let closed = false;
    async function* input() {
      try {
        for (let i = 0; i < 100; i++) {
          reads++;
          yield new TextEncoder().encode("a\nb\n");
        }
      } finally {
        closed = true;
      }
    }
    const iterator = readLines(input());
    expect(reads).toBe(0);
    await iterator.next();
    await Promise.resolve();
    expect(reads).toBe(1);
    await iterator.next();
    expect(reads).toBe(1);
    await iterator.next();
    expect(reads).toBe(2);
    await iterator.return(undefined);
    expect(closed).toBe(true);
  });
});
