/**
 * Validateur `iban_mod97` : numéro de compte bancaire international (IBAN).
 *
 * Sources :
 * - ISO 13616-1 (structure de l'IBAN, contrôle modulo 97-10 selon ISO 7064).
 * - Registre IBAN de SWIFT (longueur par pays), société désignée agence d'enregistrement
 *   de l'ISO 13616.
 *
 * Algorithme : déplacer les 4 premiers caractères à la fin, remplacer chaque lettre par
 * deux chiffres (A=10 ... Z=35), le reste modulo 97 doit valoir 1.
 *
 * Longueurs connues : CH, LI 21 ; FR, IT, MC 27 ; DE, GB 22 ; AT, LU 20 ; BE 16 ;
 * ES 24 ; NL 18. Pays inconnu : contrôle modulo 97 seul, longueur de 15 à 34.
 *
 * Limite : seule la longueur par pays est contrôlée, pas la structure détaillée du BBAN
 * (par exemple le format de la banque ou la clé nationale RIB).
 *
 * Normalisation : espaces, points et tirets ignorés, casse ignorée.
 */
import type { Validator } from "../types/index.ts";
import { modOfDigits, stripSeparators } from "./common.ts";

const IBAN_LENGTHS: Readonly<Record<string, number>> = {
  CH: 21,
  LI: 21,
  FR: 27,
  DE: 22,
  IT: 27,
  AT: 20,
  BE: 16,
  ES: 24,
  NL: 18,
  LU: 20,
  GB: 22,
  MC: 27,
};

export const iban_mod97: Validator = (value) => {
  const iban = stripSeparators(value).toUpperCase();
  if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]+$/.test(iban)) return false;
  const expected = IBAN_LENGTHS[iban.slice(0, 2)];
  if (expected !== undefined) {
    if (iban.length !== expected) return false;
  } else if (iban.length < 15 || iban.length > 34) {
    return false;
  }
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let numeric = "";
  for (const ch of rearranged) {
    const code = ch.charCodeAt(0);
    numeric += code >= 65 ? String(code - 55) : ch;
  }
  return modOfDigits(numeric, 97) === 1;
};
