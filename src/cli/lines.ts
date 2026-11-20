import { MAX_INPUT_LENGTH } from "../core/types/index.ts";

export interface InputLine {
  text: string;
  separator: string;
  bom: string;
  lineNumber: number;
}

/** Erreurs contrôlées : aucun octet ni extrait du texte n'est conservé. */
export class LineError extends Error {
  readonly code: "UTF8" | "LINE_TOO_LONG";
  readonly lineNumber: number;

  constructor(code: "UTF8" | "LINE_TOO_LONG", lineNumber: number) {
    super(
      code === "UTF8"
        ? `Encodage UTF-8 invalide à la ligne ${lineNumber}.`
        : `Ligne ${lineNumber} trop longue : maximum ${MAX_INPUT_LENGTH} unités UTF-16.`,
    );
    this.name = "LineError";
    this.code = code;
    this.lineNumber = lineNumber;
  }
}

/**
 * Lecture à la demande : seul le bloc courant et la ligne en construction sont retenus.
 * Le découpage sur l'octet LF est sûr en UTF-8 ; le décodeur strict valide chaque fragment.
 */
export async function* readLines(input: AsyncIterable<Uint8Array>): AsyncGenerator<InputLine> {
  const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
  let pending = "";
  let bom = "";
  let firstCharacter = true;
  let lineNumber = 1;

  const decode = (bytes?: Uint8Array): string => {
    try {
      return bytes === undefined ? decoder.decode() : decoder.decode(bytes, { stream: true });
    } catch {
      throw new LineError("UTF8", lineNumber);
    }
  };

  const append = (text: string, complete: boolean): void => {
    if (firstCharacter && text.length > 0) {
      firstCharacter = false;
      if (text.startsWith("\uFEFF")) {
        bom = "\uFEFF";
        text = text.slice(1);
      }
    }
    pending += text;
    // Un CR terminal peut encore appartenir au séparateur CRLF du prochain bloc.
    const possibleSeparator = pending.endsWith("\r") && !complete ? 1 : 0;
    if (pending.length - possibleSeparator > MAX_INPUT_LENGTH) {
      throw new LineError("LINE_TOO_LONG", lineNumber);
    }
  };

  for await (const bytes of input) {
    let offset = 0;
    while (offset < bytes.length) {
      const newline = bytes.indexOf(0x0a, offset);
      if (newline === -1) {
        append(decode(bytes.subarray(offset)), false);
        break;
      }
      // Inclure LF dans la validation interdit une séquence UTF-8 incomplète devant LF.
      const decoded = decode(bytes.subarray(offset, newline + 1));
      append(decoded.slice(0, -1), false);
      firstCharacter = false;
      const separator = pending.endsWith("\r") ? "\r\n" : "\n";
      const text = separator === "\r\n" ? pending.slice(0, -1) : pending;
      yield { text, separator, bom, lineNumber };
      pending = "";
      bom = "";
      lineNumber++;
      offset = newline + 1;
    }
  }
  append(decode(), true);
  if (pending.length > 0 || bom.length > 0) {
    yield { text: pending, separator: "", bom, lineNumber };
  }
}
