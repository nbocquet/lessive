import type { Operator } from "../../types/index.ts";
import { categoryLabel } from "../labels.ts";

/** Remplace la valeur par le libellé de sa catégorie, par exemple `[PERSONNE]`. */
export const categorizeOperator: Operator = {
  id: "categorize",
  apply: ({ detection }) => categoryLabel(detection.entityType),
};
