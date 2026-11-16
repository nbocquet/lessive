/**
 * Validateur `fr_nir_key` : clé du numéro d'inscription au répertoire (NIR, « numéro de
 * sécurité sociale »), 15 caractères = 13 de numéro + 2 chiffres de clé.
 *
 * Sources :
 * - INSEE, répertoire national d'identification des personnes physiques (RNIPP) :
 *   clé = 97 - (numéro de 13 chiffres modulo 97).
 * - Corse : le département 2A est traité comme 19 et 2B comme 18 pour le calcul
 *   (équivalent à retrancher 1 000 000 ou 2 000 000 après remplacement par 20,
 *   règle INSEE).
 *
 * La clé vaut donc de 01 à 97 ; « 00 » est invalide.
 * Seule la clé est contrôlée : la cohérence du sexe, de la date ou de la commune de
 * naissance n'est pas vérifiée. Les lettres A et B ne sont admises qu'aux positions 6
 * et 7 (département), précédées de 2.
 *
 * Normalisation : espaces, points et tirets ignorés, casse ignorée pour 2A/2B.
 */
import type { Validator } from "../types/index.ts";
import { modOfDigits, stripSeparators } from "./common.ts";

export const fr_nir_key: Validator = (value) => {
  const nir = stripSeparators(value).toUpperCase();
  const match = /^([0-9]{5})(?:([0-9]{2})|2([AB]))([0-9]{6})([0-9]{2})$/.exec(nir);
  if (!match) return false;
  const [, head, dept, corsica, tail, keyStr] = match;
  let department = dept;
  if (corsica !== undefined) department = corsica === "A" ? "19" : "18";
  const base = `${head}${department}${tail}`;
  const key = 97 - modOfDigits(base, 97);
  return key === Number(keyStr);
};
