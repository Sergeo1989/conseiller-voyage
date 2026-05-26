// RegenerateBackupCodesUseCase — auto-service de régénération de
// l'intégralité du lot de 10 codes de récupération (FR-014).
//
// L'utilisateur doit avoir une session "MFA frais" (StepUpGuard côté
// controller, FR-017 enrichi par P1-3 — régénération est une action
// sensible).
//
// Side effects atomiques :
//   - DELETE tout l'ancien lot (consommés + non consommés)
//   - INSERT 10 nouveaux codes hashés
//   - Audit `mfa_backup_codes_regenerated_self`
//
// Retourne les 10 clairs au caller — UNE SEULE FOIS (FR-005).

import { prisma } from '@cv/db';
import { generateBatch } from '@cv/mfa';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { BACKUP_CODE_HASHER, type BackupCodeHasher } from '../ports/backup-code-hasher.port';
import {
  BACKUP_CODE_REPOSITORY,
  type BackupCodeRepository,
} from '../ports/backup-code-repository.port';
import { MFA_AUDIT_WRITER, type MfaAuditWriter } from '../ports/mfa-audit-writer.port';
import {
  MFA_SECRET_REPOSITORY,
  type MfaSecretRepository,
} from '../ports/mfa-secret-repository.port';

export interface RegenerateBackupCodesInput {
  readonly userId: string;
  readonly actorIp?: string;
}

export interface RegenerateBackupCodesResult {
  readonly backupCodes: readonly string[];
}

@Injectable()
export class RegenerateBackupCodesUseCase {
  constructor(
    @Inject(MFA_SECRET_REPOSITORY) private readonly secrets: MfaSecretRepository,
    @Inject(BACKUP_CODE_REPOSITORY) private readonly backupCodes: BackupCodeRepository,
    @Inject(BACKUP_CODE_HASHER) private readonly hasher: BackupCodeHasher,
    @Inject(MFA_AUDIT_WRITER) private readonly audit: MfaAuditWriter,
  ) {}

  async execute(input: RegenerateBackupCodesInput): Promise<RegenerateBackupCodesResult> {
    const active = await this.secrets.findActiveByUserId(input.userId);
    if (!active) {
      throw new NotFoundException({ code: 'MFA_NOT_ENROLLED' });
    }

    // Pré-compter pour métadonnées audit
    const previousBatch = await this.backupCodes.getActiveBatch(active.id);
    const consumedCodesInPreviousBatch = previousBatch ? previousBatch.usedCount : 0;
    const previousBatchId = previousBatch?.batchId ?? null;

    // Génère nouveaux codes (FR-005 — clairs UNIQUEMENT retournés).
    const clearCodes = generateBatch();
    const batchId = crypto.randomUUID();

    // Atomique : DELETE ancien lot + INSERT nouveau lot.
    await prisma.$transaction(async (tx) => {
      await tx.mfaBackupCode.deleteMany({ where: { mfaSecretId: active.id } });
      const hashed = await Promise.all(
        clearCodes.map(async (code, idx) => ({
          mfaSecretId: active.id,
          codeHash: (await this.hasher.hash(code)) as string,
          batchId,
          position: idx + 1,
        })),
      );
      await tx.mfaBackupCode.createMany({ data: hashed });
    });

    await this.audit.append({
      eventType: 'mfa_backup_codes_regenerated_self',
      actorUserId: input.userId,
      targetUserId: input.userId,
      ...(input.actorIp ? { actorIp: input.actorIp } : {}),
      metadata: {
        previousBatchId,
        newBatchId: batchId,
        consumedCodesInPreviousBatch,
      },
    });

    return { backupCodes: clearCodes };
  }
}
