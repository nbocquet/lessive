/**
 * Validateur `fr_siren_luhn` : numéro SIREN (9 chiffres) français.
 *
 * Source : INSEE, répertoire Sirene ; la clé du SIREN (9e chiffre) suit l'algorithme de
 * Luhn (ISO/IEC 7812-1, annexe B).
 *
 * Normalisation : espaces, points et tirets ignorés.
 */
import type { Validator } from "../types/index.ts";
import { isDigits, luhnChecksum, stripSeparators } from "./common.ts";

export const fr_siren_luhn: Validator = (value) => {
  const digits = stripSeparators(value);
  return digits.length === 9 && isDigits(digits) && luhnChecksum(digits) === 0;
};
