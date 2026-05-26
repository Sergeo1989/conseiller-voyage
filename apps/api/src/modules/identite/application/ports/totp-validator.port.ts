// Port TotpValidator — vérification TOTP RFC 6238.
// Cf. ADR-0011 + contracts/totp-validator.port.md.
// Implémentation : infrastructure/otplib-totp-validator.ts qui délègue
// à `@cv/mfa/totp`.

export interface TotpValidator {
  /** Vérifie qu'un code à 6 chiffres matche le secret Base32. */
  verify(secret: string, code: string): boolean;

  /** Génère un secret TOTP Base32 de 160 bits. */
  generateSecret(): string;

  /**
   * Construit l'URL otpauth:// standard pour l'enrôlement dans une app
   * TOTP. Utilisée par le Server Component d'enrôlement pour générer
   * le QR code (R4).
   */
  buildKeyUri(accountLabel: string, secret: string): string;
}

export const TOTP_VALIDATOR = Symbol.for('TotpValidator');
