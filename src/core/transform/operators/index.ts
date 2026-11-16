import type { Operator, OperatorId } from "../../types/index.ts";
import { categorizeOperator } from "./categorize.ts";
import { maskOperator } from "./mask.ts";
import { pseudonymizeOperator } from "./pseudonymize.ts";
import { suppressOperator } from "./suppress.ts";

export { categorizeOperator } from "./categorize.ts";
export { maskOperator, maskValue } from "./mask.ts";
export type { GraphemeSegmenter } from "./mask.ts";
export { pseudonymizeOperator } from "./pseudonymize.ts";
export { suppressOperator } from "./suppress.ts";

/** Les opérateurs du MVP, par identifiant. */
export const OPERATORS: Readonly<Record<OperatorId, Operator>> = {
  suppress: suppressOperator,
  mask: maskOperator,
  categorize: categorizeOperator,
  pseudonymize: pseudonymizeOperator,
};
