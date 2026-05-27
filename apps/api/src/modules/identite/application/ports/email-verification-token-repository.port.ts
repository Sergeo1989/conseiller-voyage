// T035 — Port repository des tokens de vérification d'email (feature 002).

export interface EmailVerificationTokenRow {
  readonly id: string;
  readonly userId: string;
  readonly jwtNonce: string;
  readonly expiresAt: Date;
  readonly consumedAt: Date | null;
}

export interface CreateEmailVerificationTokenInput {
  readonly userId: string;
  readonly jwtNonce: string;
  readonly expiresAt: Date;
}

export interface EmailVerificationTokenRepository {
  create(input: CreateEmailVerificationTokenInput): Promise<EmailVerificationTokenRow>;
  findByNonceUnconsumedNotExpired(
    nonce: string,
    now: Date,
  ): Promise<EmailVerificationTokenRow | null>;
  markConsumed(id: string, now: Date): Promise<void>;
  countActiveByUserId(userId: string, now: Date): Promise<number>;
}

export const EMAIL_VERIFICATION_TOKEN_REPOSITORY = Symbol.for('EmailVerificationTokenRepository');
