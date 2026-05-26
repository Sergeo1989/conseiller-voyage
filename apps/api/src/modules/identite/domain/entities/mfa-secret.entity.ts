// Entité MfaSecret — secret TOTP chiffré associé à un utilisateur.
// Cf. specs/005-mfa-conseiller/data-model.md § MfaSecret.
//
// Invariants métier (appliqués par index partiel Postgres) :
//   - Un seul `MfaSecret` actif (enabledAt IS NOT NULL) par user.
//   - Plusieurs `MfaSecret` pending (enabledAt = null) tolérés
//     transitoirement pendant la sémantique supersede (P0-1).

import type { EncryptedTotpSecret } from '../value-objects/encrypted-totp-secret.vo';

export const MFA_SECRET_KINDS = ['totp'] as const;
export type MfaSecretKind = (typeof MFA_SECRET_KINDS)[number];

export interface MfaSecret {
  readonly id: string; // UUID
  readonly userId: string; // UUID auth_users
  readonly kind: MfaSecretKind;
  readonly encryptedSecret: EncryptedTotpSecret;
  readonly enrolledAt: Date;
  readonly enabledAt: Date | null;
  readonly lastUsedAt: Date | null;
  readonly enrollmentRequestId: string; // UUID v4
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** Helper : un secret est-il pleinement enrôlé ? */
export function isMfaSecretEnabled(secret: MfaSecret): boolean {
  return secret.enabledAt !== null;
}
