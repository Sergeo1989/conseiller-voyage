// T037 — Port repository des tokens d'invitation admin (feature 002 US7).

export interface AdminInvitationTokenRow {
  readonly id: string;
  readonly targetEmail: string;
  readonly inviterUserId: string | null;
  readonly jwtNonce: string;
  readonly expiresAt: Date;
  readonly consumedAt: Date | null;
  readonly createdAuthUserId: string | null;
}

export interface CreateAdminInvitationTokenInput {
  readonly targetEmail: string;
  readonly inviterUserId: string;
  readonly jwtNonce: string;
  readonly expiresAt: Date;
}

export interface AdminInvitationTokenRepository {
  create(input: CreateAdminInvitationTokenInput): Promise<AdminInvitationTokenRow>;
  findByNonceUnconsumedNotExpired(
    nonce: string,
    now: Date,
  ): Promise<AdminInvitationTokenRow | null>;
  findActiveByTargetEmail(targetEmail: string, now: Date): Promise<AdminInvitationTokenRow | null>;
  /**
   * Marque le token consommé et lie l'ID du nouvel utilisateur créé.
   */
  markConsumedWithAuthUser(tokenId: string, authUserId: string, now: Date): Promise<void>;
}

export const ADMIN_INVITATION_TOKEN_REPOSITORY = Symbol.for('AdminInvitationTokenRepository');
