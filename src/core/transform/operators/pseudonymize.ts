import type { Operator } from "../../types/index.ts";

/**
 * Remplace la valeur par le pseudonyme de l'entité que la session lui associe.
 * La résolution d'entités (formes partielles, titres…) est faite par la session.
 */
export const pseudonymizeOperator: Operator = {
  id: "pseudonymize",
  apply: ({ value, detection, session }) => {
    if (!session) {
      throw new Error("L'opérateur pseudonymize exige une session de pseudonymisation.");
    }
    return session.resolve(value, detection.entityType).pseudonym;
  },
};
