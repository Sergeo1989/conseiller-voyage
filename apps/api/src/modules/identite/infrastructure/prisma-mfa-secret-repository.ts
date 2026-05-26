// Adapter Prisma du port MfaSecretRepository.
// P0-1 : supersedePending est atomique via transaction.

import { prisma } from '@cv/db';
import { Injectable } from '@nestjs/common';
import type {
  MfaSecretRepository,
  MfaSecretToCreate,
} from '../application/ports/mfa-secret-repository.port';
import type { MfaSecret } from '../domain/entities/mfa-secret.entity';
import type { EncryptedTotpSecret } from '../domain/value-objects/encrypted-totp-secret.vo';

@Injectable()
export class PrismaMfaSecretRepository implements MfaSecretRepository {
  async findActiveByUserId(userId: string): Promise<MfaSecret | null> {
    const row = await prisma.mfaSecret.findFirst({
      where: { userId, enabledAt: { not: null } },
    });
    return row ? this.toEntity(row) : null;
  }

  async findPendingByUserId(userId: string): Promise<MfaSecret[]> {
    const rows = await prisma.mfaSecret.findMany({
      where: { userId, enabledAt: null },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((r) => this.toEntity(r));
  }

  async findByEnrollmentRequestId(enrollmentRequestId: string): Promise<MfaSecret | null> {
    const row = await prisma.mfaSecret.findUnique({
      where: { enrollmentRequestId },
    });
    return row ? this.toEntity(row) : null;
  }

  async supersedePending(secret: MfaSecretToCreate): Promise<MfaSecret> {
    // Transaction atomique (P0-1 du review) :
    //   1. Refus immédiat si un secret ACTIF existe — le caller doit
    //      passer par US4 (reset admin) ou US6 (device change).
    //   2. DELETE des secrets pending existants
    //   3. INSERT du nouveau secret pending
    const row = await prisma.$transaction(async (tx) => {
      const active = await tx.mfaSecret.findFirst({
        where: { userId: secret.userId, enabledAt: { not: null } },
      });
      if (active) {
        throw new Error('MFA_ALREADY_ENROLLED');
      }
      await tx.mfaSecret.deleteMany({
        where: { userId: secret.userId, enabledAt: null },
      });
      return tx.mfaSecret.create({
        data: {
          userId: secret.userId,
          encryptedSecret: secret.encryptedSecret as string,
          enrollmentRequestId: secret.enrollmentRequestId,
        },
      });
    });
    return this.toEntity(row);
  }

  async enable(secretId: string): Promise<void> {
    const now = new Date();
    await prisma.mfaSecret.update({
      where: { id: secretId },
      data: { enabledAt: now, lastUsedAt: now },
    });
  }

  async touchLastUsed(secretId: string): Promise<void> {
    await prisma.mfaSecret.update({
      where: { id: secretId },
      data: { lastUsedAt: new Date() },
    });
  }

  async delete(secretId: string): Promise<void> {
    await prisma.mfaSecret.delete({ where: { id: secretId } });
  }

  async deleteAllByUserId(userId: string): Promise<number> {
    const result = await prisma.mfaSecret.deleteMany({ where: { userId } });
    return result.count;
  }

  private toEntity(row: {
    id: string;
    userId: string;
    kind: 'totp';
    encryptedSecret: string;
    enrolledAt: Date;
    enabledAt: Date | null;
    lastUsedAt: Date | null;
    enrollmentRequestId: string;
    createdAt: Date;
    updatedAt: Date;
  }): MfaSecret {
    return {
      id: row.id,
      userId: row.userId,
      kind: row.kind,
      encryptedSecret: row.encryptedSecret as EncryptedTotpSecret,
      enrolledAt: row.enrolledAt,
      enabledAt: row.enabledAt,
      lastUsedAt: row.lastUsedAt,
      enrollmentRequestId: row.enrollmentRequestId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
