// PrismaProfilModerationAuditReader (feature 007 US6 console admin).
//
// Impl du port ProfilModerationAuditReader. Lit la table append-only
// profile_moderation_audits triée par occurredAt DESC. Pas de FK Prisma
// vers AuthUser (pattern ADR-0012) ; l'identification de l'admin se
// fait via adminAuthUserId + adminEmailHash.

import { prisma } from '@cv/db';
import { Injectable } from '@nestjs/common';
import type {
  ProfilModerationAuditEntry,
  ProfilModerationAuditReader,
} from '../application/ports/profil-moderation-audit-reader.port';

const DEFAULT_LIMIT = 50;

@Injectable()
export class PrismaProfilModerationAuditReader implements ProfilModerationAuditReader {
  async listByProfileId(
    profileId: string,
    limit: number = DEFAULT_LIMIT,
  ): Promise<readonly ProfilModerationAuditEntry[]> {
    const rows = await prisma.profilModerationAudit.findMany({
      where: { profileId },
      orderBy: { occurredAt: 'desc' },
      take: limit,
    });
    return rows.map((r) => ({
      id: r.id,
      profileId: r.profileId,
      adminAuthUserId: r.adminAuthUserId,
      adminEmailHash: r.adminEmailHash,
      action: r.action,
      raison: r.raison,
      metadonneesJson: r.metadonneesJson,
      occurredAt: r.occurredAt,
    }));
  }
}
