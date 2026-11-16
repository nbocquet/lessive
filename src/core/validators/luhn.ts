/**
 * Validateur `luhn` : numéros de cartes bancaires.
 *
 * Sources :
 * - ISO/IEC 7812-1, annexe B (algorithme de Luhn, modulo 10).
 * - Longueur 12 à 19 chiffres : ISO/IEC 7812-1 (numéro d'identification de l'émetteur
 *   + compte + clé ; 19 chiffres au maximum).
 *
 * Normalisation : espaces et tirets de groupement sont ignorés ; tout autre caractère
 * (lettres, points, etc.) rend la valeur invalide.
 */
import type { Validator } from "../types/index.ts";
import { isDigits, luhnChecksum } from "./common.ts";

export const luhn: Validator = (value) => {
  const digits = value.replace(/[\s-]/g, "");
  if (!isDigits(digits) || digits.length < 12 || digits.length > 19) return false;
  return luhnChecksum(digits) === 0;
};
