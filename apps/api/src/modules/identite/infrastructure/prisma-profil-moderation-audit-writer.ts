// T042 — PrismaProfilModerationAuditWriter (feature 007, FR-023).
//
// Impl du port ProfilModerationAuditWriter (T032). Hash SHA-256 de
// l'email admin pour corrélation post-effacement (pattern ADR-0012 +
// 002a mfa-audit-writer). Append-only enforced par les triggers
// Postgres `profile_moderation_audits_no_*`.

import { createHash } from 'node:crypto';
import { Prisma, prisma } from '@cv/db';
import { Injectable } from '@nestjs/common';
import type {
  AppendProfilModerationAuditInput,
  ProfilModerationAuditWriter,
} from '../application/ports/profil-moderation-audit-writer.port';

type Db = Prisma.TransactionClient | typeof prisma;

function sha256Hex(input: string): string {
  return createHash('sha256').update(input.trim().toLowerCase()).digest('hex');
}

@Injectable()
export class PrismaProfilModerationAuditWriter implements ProfilModerationAuditWriter {
  private db(tx?: Prisma.TransactionClient): Db {
    return tx ?? prisma;
  }

  async append(
    input: AppendProfilModerationAuditInput,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    await this.db(tx).profilModerationAudit.create({
      data: {
        profileId: input.profileId,
        adminAuthUserId: input.adminAuthUserId,
        adminEmailHash: sha256Hex(input.adminEmail),
        action: input.action,
        raison: input.raison,
        metadonneesJson: input.metadonneesJson ?? Prisma.JsonNull,
      },
    });
  }
}
