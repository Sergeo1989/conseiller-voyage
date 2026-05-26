// Adapter Prisma du port BackupCodeRepository.
// P0-5 : consumeAtomic via UPDATE conditionnel.

import { prisma } from '@cv/db';
import { Injectable } from '@nestjs/common';
import type {
  BackupCodeRepository,
  BackupCodeToCreate,
} from '../application/ports/backup-code-repository.port';
import type { BackupCode, BackupCodeBatch } from '../domain/entities/backup-code-batch.entity';
import type { BackupCodeHash } from '../domain/value-objects/backup-code-hash.vo';

@Injectable()
export class PrismaBackupCodeRepository implements BackupCodeRepository {
  async createBatch(codes: readonly BackupCodeToCreate[]): Promise<void> {
    await prisma.mfaBackupCode.createMany({
      data: codes.map((c) => ({
        mfaSecretId: c.mfaSecretId,
        codeHash: c.codeHash as string,
        batchId: c.batchId,
        position: c.position,
      })),
      // Skip duplicates : sur retry réseau, les codes du même batch
      // ne sont pas re-insérés (idempotence via @@unique).
      skipDuplicates: true,
    });
  }

  async findUnusedByMfaSecret(mfaSecretId: string): Promise<BackupCode[]> {
    const rows = await prisma.mfaBackupCode.findMany({
      where: { mfaSecretId, usedAt: null },
    });
    return rows.map((r) => this.toEntity(r));
  }

  async consumeAtomic(codeId: string): Promise<boolean> {
    // P0-5 : UPDATE conditionnel WHERE usedAt IS NULL.
    // Si rowCount === 0, soit le code n'existe pas, soit une autre
    // requête l'a consommé entre-temps. Dans les deux cas le caller
    // traite comme INVALID_BACKUP_CODE.
    const result = await prisma.mfaBackupCode.updateMany({
      where: { id: codeId, usedAt: null },
      data: { usedAt: new Date() },
    });
    return result.count === 1;
  }

  async countRemaining(mfaSecretId: string): Promise<number> {
    return prisma.mfaBackupCode.count({
      where: { mfaSecretId, usedAt: null },
    });
  }

  async getActiveBatch(mfaSecretId: string): Promise<BackupCodeBatch | null> {
    const codes = await prisma.mfaBackupCode.findMany({
      where: { mfaSecretId },
      orderBy: { generatedAt: 'desc' },
    });
    if (codes.length === 0) return null;

    // Le batch actif = celui généré le plus récemment. On filtre par
    // batchId du 1er résultat (le plus récent).
    const activeBatchId = codes[0]?.batchId;
    if (!activeBatchId) return null;

    const batch = codes.filter((c) => c.batchId === activeBatchId);
    const usedCount = batch.filter((c) => c.usedAt !== null).length;
    const generatedAt = batch[0]?.generatedAt ?? new Date();

    return {
      batchId: activeBatchId,
      mfaSecretId,
      totalCount: batch.length,
      usedCount,
      remainingCount: batch.length - usedCount,
      generatedAt,
    };
  }

  async deleteAllByMfaSecret(mfaSecretId: string): Promise<number> {
    const result = await prisma.mfaBackupCode.deleteMany({
      where: { mfaSecretId },
    });
    return result.count;
  }

  private toEntity(row: {
    id: string;
    mfaSecretId: string;
    codeHash: string;
    batchId: string;
    position: number;
    generatedAt: Date;
    usedAt: Date | null;
    createdAt: Date;
  }): BackupCode {
    return {
      id: row.id,
      mfaSecretId: row.mfaSecretId,
      codeHash: row.codeHash as BackupCodeHash,
      batchId: row.batchId,
      position: row.position,
      generatedAt: row.generatedAt,
      usedAt: row.usedAt,
      createdAt: row.createdAt,
    };
  }
}
