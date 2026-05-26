// Adapter Prisma du port ActiveSessionRevoker.
// P0-3 : supprime aussi les buckets stepup_totp orphelins.

import { prisma } from '@cv/db';
import { Injectable } from '@nestjs/common';
import type { ActiveSessionRevoker } from '../application/ports/active-session-revoker.port';

@Injectable()
export class PrismaActiveSessionRevoker implements ActiveSessionRevoker {
  async revokeAll(userId: string): Promise<number> {
    return prisma.$transaction(async (tx) => {
      const sessionIds = await tx.authSession.findMany({
        where: { userId },
        select: { id: true },
      });

      const ids = sessionIds.map((s) => s.id);

      const result = await tx.authSession.deleteMany({ where: { userId } });

      // P0-3 — nettoyer les buckets stepup_totp scope-session orphelins.
      if (ids.length > 0) {
        await tx.mfaRateLimitBucket.deleteMany({
          where: {
            userId,
            kind: 'stepup_totp',
            sessionId: { in: ids },
          },
        });
      }

      return result.count;
    });
  }

  async revokeAllExcept(userId: string, exceptSessionToken: string): Promise<number> {
    return prisma.$transaction(async (tx) => {
      // Trouver la session courante par token pour exclure son id.
      const current = await tx.authSession.findUnique({
        where: { sessionToken: exceptSessionToken },
        select: { id: true },
      });
      const currentId = current?.id ?? null;

      const targetSessions = await tx.authSession.findMany({
        where: {
          userId,
          ...(currentId ? { id: { not: currentId } } : {}),
        },
        select: { id: true },
      });
      const ids = targetSessions.map((s) => s.id);

      const result = await tx.authSession.deleteMany({
        where: {
          userId,
          ...(currentId ? { id: { not: currentId } } : {}),
        },
      });

      if (ids.length > 0) {
        await tx.mfaRateLimitBucket.deleteMany({
          where: {
            userId,
            kind: 'stepup_totp',
            sessionId: { in: ids },
          },
        });
      }

      return result.count;
    });
  }
}
