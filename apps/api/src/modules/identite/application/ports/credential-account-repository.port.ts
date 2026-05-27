// T034 — Port repository des comptes credentials (feature 002).
//
// Encapsule l'accès à la table auth_accounts pour les lookups par email
// (cas login + signup duplicate detection). Lookup symétrique JOIN unifié
// pour ne pas fuiter le timing (R5/C6).

export interface CredentialAccount {
  readonly userId: string;
  readonly email: string;
  readonly role: 'voyageur' | 'conseiller' | 'admin';
  readonly emailVerifiedAt: Date | null;
  readonly passwordHash: string | null;
}

export interface CredentialAccountRepository {
  /**
   * Lookup unifié par email — SELECT auth_users JOIN auth_accounts.
   * Retourne null si le compte n'existe pas (anti-énumération).
   * Le caller appliquera bcrypt sur DUMMY_HASH dans ce cas.
   */
  findByEmail(emailNormalized: string): Promise<CredentialAccount | null>;
}

export const CREDENTIAL_ACCOUNT_REPOSITORY = Symbol.for('CredentialAccountRepository');
