// Port BackupCodeRepository — accès aux codes de récupération hashés.
//
// Atomicité P0-5 : `consumeAtomic` exécute un UPDATE conditionnel
// `WHERE id = ? AND usedAt IS NULL RETURNING id` et retourne true si
// rowCount === 1, false sinon (race perdue). Empêche la double
// consommation théorique.

import type { BackupCode, BackupCodeBatch } from '../../domain/entities/backup-code-batch.entity';
import type { BackupCodeHash } from '../../domain/value-objects/backup-code-hash.vo';

export interface BackupCodeToCreate {
  readonly mfaSecretId: string;
  readonly batchId: string;
  readonly position: number; // 1..10
  readonly codeHash: BackupCodeHash;
}

export interface BackupCodeRepository {
  /**
   * Insère un lot de 10 codes hashés. Idempotent par `batchId` —
   * un retry réseau ne crée pas de doublons.
   */
  createBatch(codes: readonly BackupCodeToCreate[]): Promise<void>;

  /** Retourne tous les codes non consommés du secret cible. */
  findUnusedByMfaSecret(mfaSecretId: string): Promise<BackupCode[]>;

  /**
   * Marque un code comme consommé via UPDATE conditionnel atomique.
   * Retourne true si la consommation a réussi, false si le code a
   * été consommé par une autre requête entre temps (race perdue).
   * Le caller doit traiter false comme un échec de validation.
   */
  consumeAtomic(codeId: string): Promise<boolean>;

  /** Nombre de codes non consommés pour le secret cible. */
  countRemaining(mfaSecretId: string): Promise<number>;

  /** Vue d'ensemble du lot actif pour un secret. */
  getActiveBatch(mfaSecretId: string): Promise<BackupCodeBatch | null>;

  /**
   * Supprime tous les codes d'un secret (utilisé par la régénération
   * FR-014/FR-015 et par les cascades reset/device change).
   */
  deleteAllByMfaSecret(mfaSecretId: string): Promise<number>;
}

export const BACKUP_CODE_REPOSITORY = Symbol.for('BackupCodeRepository');
