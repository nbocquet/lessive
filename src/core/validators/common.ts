/**
 * Utilitaires communs aux validateurs (TypeScript pur, R3).
 * Aucune valeur n'est journalisée ni renvoyée dans un message (R5).
 */

/** Retire espaces (y compris insécables), points et tirets de séparation. */
export function stripSeparators(value: string): string {
  return value.replace(/[\s.\-\u2010-\u2015]/g, "");
}

/** Vrai si la chaîne est non vide et ne contient que des chiffres ASCII. */
export function isDigits(value: string): boolean {
  return /^[0-9]+$/.test(value);
}

/** Somme de Luhn (norme ISO/IEC 7812-1, annexe B) ; la valeur est valide si le résultat est 0. */
export function luhnChecksum(digits: string): number {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10;
}

/** Somme des chiffres d'une chaîne composée uniquement de chiffres. */
export function digitSum(digits: string): number {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) sum += digits.charCodeAt(i) - 48;
  return sum;
}

/** Reste modulo `m` d'un entier décimal long, sans BigInt (chiffre par chiffre). */
export function modOfDigits(digits: string, m: number): number {
  let r = 0;
  for (let i = 0; i < digits.length; i++) r = (r * 10 + (digits.charCodeAt(i) - 48)) % m;
  return r;
}
