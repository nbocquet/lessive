export { buildRecognizer, createAnalyzer } from "./analyzer.ts";
export type { Analyzer, AnalyzeOptions } from "./analyzer.ts";
export { collectAmbiguousNames, propagatePersonNames } from "./propagate-names.ts";
export type { PropagateOptions } from "./propagate-names.ts";
export { ADDRESS_MERGE_BOOST, isAddressPart, mergeAddressParts } from "./merge-addresses.ts";
