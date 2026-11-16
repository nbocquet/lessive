/** API publique des détecteurs par motif et par dictionnaire. */
export { PatternRecognizer } from "./pattern-recognizer.ts";
export { DictionaryRecognizer } from "./dictionary-recognizer.ts";
export { AbortError } from "./errors.ts";
export { foldText, foldString, tokenizeWords } from "./normalize.ts";
export type { FoldedText, FoldOptions, Span, WordToken } from "./normalize.ts";
