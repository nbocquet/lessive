/**
 * Validateur `ch_uid_mod11` : numéro d'identification des entreprises suisse (IDE / UID),
 * forme CHE-123.456.789, éventuellement suivie de TVA, MWST ou IVA.
 *
 * Sources :
 * - OFS (Office fédéral de la statistique), registre IDE ; norme eCH-0097
 *   (structure du numéro d'identification des entreprises) ; LIDE (RS 431.03).
 *
 * Algorithme : poids 5, 4, 3, 2, 7, 6, 5, 4 sur les 8 premiers chiffres ;
 * clé = 11 - (somme mod 11) ; 11 devient 0 ; 10 rend le numéro invalide.
 *
 * Normalisation : préfixe « CHE » facultatif (avec tiret, point ou espace), séparateurs
 * ignorés, suffixe TVA / MWST / IVA facultatif (casse ignorée).
 */
import type { Validator } from "../types/index.ts";
import { isDigits, stripSeparators } from "./common.ts";

const WEIGHTS = [5, 4, 3, 2, 7, 6, 5, 4] as const;

export const ch_uid_mod11: Validator = (value) => {
  const cleaned = stripSeparators(value.trim().replace(/[\s.-]*(TVA|MWST|IVA)$/i, ""))
    .toUpperCase()
    .replace(/^CHE/, "");
  if (cleaned.length !== 9 || !isDigits(cleaned)) return false;
  let sum = 0;
  for (let i = 0; i < 8; i++) sum += WEIGHTS[i]! * (cleaned.charCodeAt(i) - 48);
  let key = 11 - (sum % 11);
  if (key === 10) return false;
  if (key === 11) key = 0;
  return key === cleaned.charCodeAt(8) - 48;
};
