// Entité BackupCodeBatch — lot de 10 codes de récupération.
// Cf. specs/005-mfa-conseiller/data-model.md § MfaBackupCode.
//
// Les codes sont représentés ici comme entités individuelles (hash +
// position + usedAt). Le lot est une vue logique — il n'y a pas de
// table `backup_code_batches` distincte ; tous les codes du même
// `batchId` constituent un lot.

import type { BackupCodeHash } from '../value-objects/backup-code-hash.vo';

export interface BackupCode {
  readonly id: string; // UUID
  readonly mfaSecretId: string; // UUID
  readonly codeHash: BackupCodeHash;
  readonly batchId: string; // UUID — partagé par tous les codes du lot
  readonly position: number; // 1..10
  readonly generatedAt: Date;
  readonly usedAt: Date | null;
  readonly createdAt: Date;
}

/**
 * Vue logique d'un lot de backup codes — utilisée par les use cases
 * pour exposer l'état d'un lot sans détailler chaque code.
 */
export interface BackupCodeBatch {
  readonly batchId: string;
  readonly mfaSecretId: string;
  readonly totalCount: number;
  readonly usedCount: number;
  readonly remainingCount: number;
  readonly generatedAt: Date;
}

/** Helper : doit-on prévenir l'utilisateur ? (FR-012, < 3 codes restants) */
export function shouldWarnLowCodes(batch: BackupCodeBatch): boolean {
  return batch.remainingCount < 3;
}
