// T048 — PrismaAuthAuditWriter (feature 002 / H7 / ADR-0012).
//
// Calcule actorEmailHash et targetEmailHash via SHA-256 base64 avant
// INSERT. UUID actorUserId / targetUserId nu, pas de FK Prisma.

import { createHash } from 'node:crypto';
import { prisma } from '@cv/db';
import { Injectable } from '@nestjs/common';
import type {
  AppendAuthAuditInput,
  AuthAuditWriter,
} from '../application/ports/auth-audit-writer.port';

function hashEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  return createHash('sha256').update(email, 'utf8').digest('base64');
}

@Injectable()
export class PrismaAuthAuditWriter implements AuthAuditWriter {
  async append(input: AppendAuthAuditInput): Promise<void> {
    await prisma.authAuditEvent.create({
      data: {
        eventType: input.eventType,
        actorUserId: input.actorUserId ?? null,
        targetUserId: input.targetUserId ?? null,
        actorEmailHash: hashEmail(input.actorEmail),
        targetEmailHash: hashEmail(input.targetEmail),
        actorIp: input.actorIp ?? null,
        metadata: input.metadata ?? {},
      },
    });
  }
}
