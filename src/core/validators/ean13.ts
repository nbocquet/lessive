/**
 * Validateur `ean13` : clé de contrôle EAN-13 (GS1), utilisée pour le numéro AVS suisse.
 *
 * Sources :
 * - GS1 General Specifications, calcul de la clé de contrôle GS1 (poids 1 et 3 en
 *   alternance depuis la gauche, clé = (10 - somme mod 10) mod 10).
 * - OFAS / ZAS : le nouveau numéro AVS à 13 chiffres (756.XXXX.XXXX.XC) est construit
 *   comme un code EAN-13 dont le dernier chiffre est la clé de contrôle.
 *
 * Partage des rôles : ce validateur vérifie UNIQUEMENT les 13 chiffres et la clé EAN-13.
 * Le préfixe 756 (code GS1 de la Suisse) et le format de présentation avec points sont
 * contrôlés par le motif du pack `country-ch`, pas ici. `ean13` accepte donc tout code
 * EAN-13 valide, quel que soit son préfixe.
 *
 * Normalisation : espaces, points et tirets ignorés.
 */
import type { Validator } from "../types/index.ts";
import { isDigits, stripSeparators } from "./common.ts";

export const ean13: Validator = (value) => {
  const digits = stripSeparators(value);
  if (digits.length !== 13 || !isDigits(digits)) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const d = digits.charCodeAt(i) - 48;
    sum += i % 2 === 0 ? d : 3 * d;
  }
  const key = (10 - (sum % 10)) % 10;
  return key === digits.charCodeAt(12) - 48;
};
