/**
 * Validateur `fr_siret_luhn` : numéro SIRET (14 chiffres = SIREN + NIC) français.
 *
 * Source : INSEE, répertoire Sirene ; contrôle de Luhn (ISO/IEC 7812-1, annexe B) sur les
 * 14 chiffres.
 *
 * Exception La Poste (SIREN 356000000) : les SIRET des établissements de La Poste ne
 * suivent pas Luhn ; ils sont valides lorsque la somme de leurs 14 chiffres est un
 * multiple de 5. Pour ce SIREN, seule cette règle est appliquée (comportement aligné sur
 * la bibliothèque de référence python-stdnum).
 *
 * Normalisation : espaces, points et tirets ignorés.
 */
import type { Validator } from "../types/index.ts";
import { digitSum, isDigits, luhnChecksum, stripSeparators } from "./common.ts";

const LA_POSTE_SIREN = "356000000";

export const fr_siret_luhn: Validator = (value) => {
  const digits = stripSeparators(value);
  if (digits.length !== 14 || !isDigits(digits)) return false;
  if (digits.startsWith(LA_POSTE_SIREN)) return digitSum(digits) % 5 === 0;
  return luhnChecksum(digits) === 0;
};
