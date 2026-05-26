// Port MfaSecretRepository — accès aux secrets TOTP en BD.
// Implémentation Prisma : infrastructure/prisma-mfa-secret-repository.ts.
//
// Sémantique supersede (P0-1) : `supersedePending` est atomique —
// suppression des secrets pending + insertion du nouveau dans une seule
// transaction Postgres.

import type { MfaSecret } from '../../domain/entities/mfa-secret.entity';
import type { EncryptedTotpSecret } from '../../domain/value-objects/encrypted-totp-secret.vo';

export interface MfaSecretToCreate {
  readonly userId: string;
  readonly encryptedSecret: EncryptedTotpSecret;
  readonly enrollmentRequestId: string;
}

export interface MfaSecretRepository {
  /** Retourne le secret actif (enabledAt IS NOT NULL) du user, ou null. */
  findActiveByUserId(userId: string): Promise<MfaSecret | null>;

  /** Retourne tous les secrets pending (enabledAt = null) du user. */
  findPendingByUserId(userId: string): Promise<MfaSecret[]>;

  /** Lookup par enrollmentRequestId. */
  findByEnrollmentRequestId(enrollmentRequestId: string): Promise<MfaSecret | null>;

  /**
   * Atomique : supprime tous les secrets pending du user, puis insère le
   * nouveau. Préserve l'éventuel secret actif (enabledAt IS NOT NULL) —
   * dans ce cas l'index partiel Postgres lèvera une contrainte unique au
   * moment de l'INSERT (cas géré par le use case en throw
   * `MfaAlreadyEnrolledError`).
   */
  supersedePending(secret: MfaSecretToCreate): Promise<MfaSecret>;

  /**
   * Marque un secret comme activé (enabledAt = NOW, lastUsedAt = NOW)
   * après vérification du premier code TOTP.
   */
  enable(secretId: string): Promise<void>;

  /** Met à jour lastUsedAt sur une vérification réussie. */
  touchLastUsed(secretId: string): Promise<void>;

  /** Supprime un secret (cascade backup codes via FK Prisma). */
  delete(secretId: string): Promise<void>;

  /** Supprime tous les secrets du user (US4 reset admin, US6 device change). */
  deleteAllByUserId(userId: string): Promise<number>;
}

export const MFA_SECRET_REPOSITORY = Symbol.for('MfaSecretRepository');
