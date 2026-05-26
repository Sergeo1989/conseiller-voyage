// T036 — Port repository des tokens de reset password (feature 002).

export interface PasswordResetTokenRow {
  readonly id: string;
  readonly userId: string;
  readonly jwtNonce: string;
  readonly expiresAt: Date;
  readonly consumedAt: Date | null;
  readonly invalidatedAt: Date | null;
}

export interface CreatePasswordResetTokenInput {
  readonly userId: string;
  readonly jwtNonce: string;
  readonly expiresAt: Date;
}

export interface PasswordResetTokenRepository {
  create(input: CreatePasswordResetTokenInput): Promise<PasswordResetTokenRow>;
  findByNonceActive(nonce: string, now: Date): Promise<PasswordResetTokenRow | null>;
  countActiveByUserId(userId: string, now: Date): Promise<number>;
  /**
   * Marque le token comme consommé ET invalide tous les autres tokens
   * actifs du même userId (atomique côté DB via UPDATE).
   */
  consumeAndInvalidateOthers(tokenId: string, userId: string, now: Date): Promise<void>;
}

export const PASSWORD_RESET_TOKEN_REPOSITORY = Symbol.for('PasswordResetTokenRepository');
