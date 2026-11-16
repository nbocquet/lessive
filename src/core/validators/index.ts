/**
 * Registre des validateurs algorithmiques (liste fermée, R8).
 * Le type `Record<ValidatorName, Validator>` garantit à la compilation que chaque nom de
 * `VALIDATOR_NAMES` a une implémentation, et inversement.
 */
import type { Validator, ValidatorName } from "../types/index.ts";
import { ch_uid_mod11 } from "./ch_uid_mod11.ts";
import { ean13 } from "./ean13.ts";
import { fr_nir_key } from "./fr_nir_key.ts";
import { fr_siren_luhn } from "./fr_siren_luhn.ts";
import { fr_siret_luhn } from "./fr_siret_luhn.ts";
import { iban_mod97 } from "./iban_mod97.ts";
import { luhn } from "./luhn.ts";

export const validators: Record<ValidatorName, Validator> = {
  luhn,
  iban_mod97,
  ean13,
  fr_nir_key,
  ch_uid_mod11,
  fr_siren_luhn,
  fr_siret_luhn,
};

export function getValidator(name: ValidatorName): Validator {
  return validators[name];
}

export { ch_uid_mod11, ean13, fr_nir_key, fr_siren_luhn, fr_siret_luhn, iban_mod97, luhn };
