// Port TotpSecretEncrypter — chiffre/déchiffre le secret TOTP au repos.
// Cf. ADR-0010 + contracts/mfa-encrypter.port.md.
// Implémentation : infrastructure/node-crypto-totp-secret-encrypter.ts
// qui délègue à `@cv/mfa/encryption`.

import type { EncryptedTotpSecret } from '../../domain/value-objects/encrypted-totp-secret.vo';

export interface TotpSecretEncrypter {
  /**
   * Chiffre un secret TOTP Base32 clair. IV aléatoire à chaque appel.
   *
   * @throws KekInvalidSizeError si la KEK injectée ne fait pas 32 octets.
   */
  encrypt(plaintextSecret: string): EncryptedTotpSecret;

  /**
   * Déchiffre. Vérifie l'auth tag — toute altération est détectée.
   *
   * @throws TotpSecretIntegrityError si auth tag invalide.
   * @throws TotpSecretFormatError    si format sérialisé invalide.
   */
  decrypt(encrypted: EncryptedTotpSecret): string;
}

export const TOTP_SECRET_ENCRYPTER = Symbol.for('TotpSecretEncrypter');
