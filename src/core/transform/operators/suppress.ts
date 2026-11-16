import type { Operator } from "../../types/index.ts";

/** Supprime la valeur : le remplacement est une chaîne vide. */
export const suppressOperator: Operator = {
  id: "suppress",
  apply: () => "",
};
