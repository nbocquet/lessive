/**
 * Erreur du format d'export chiffré. Les messages sont en français et ne
 * contiennent jamais la phrase de passe ni une valeur du contenu (R5).
 */
export type CryptoErrorCode =
  | "passphrase-too-short"
  | "unsupported-format"
  | "invalid-parameters"
  | "malformed-file"
  | "authentication-failed"
  | "unavailable";

export class CryptoFormatError extends Error {
  readonly code: CryptoErrorCode;
  constructor(code: CryptoErrorCode, message: string) {
    super(message);
    this.name = "CryptoFormatError";
    this.code = code;
  }
}
