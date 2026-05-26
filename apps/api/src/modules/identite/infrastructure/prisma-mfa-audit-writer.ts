// Adapter Prisma du port MfaAuditWriter.
// La table mfa_audit_events est append-only (triggers Postgres).
// L'API expose uniquement `append` — pas d'update/delete possible.

import { Prisma, prisma } from '@cv/db';
import { Injectable } from '@nestjs/common';
import type {
  MfaAuditEventToAppend,
  MfaAuditWriter,
} from '../application/ports/mfa-audit-writer.port';

@Injectable()
export class PrismaMfaAuditWriter implements MfaAuditWriter {
  async append(event: MfaAuditEventToAppend): Promise<void> {
    await prisma.mfaAuditEvent.create({
      data: {
        eventType: event.eventType,
        actorUserId: event.actorUserId,
        targetUserId: event.targetUserId,
        targetRole: event.targetRole ?? null,
        actorIp: event.actorIp ?? null,
        method: event.method ?? null,
        justification: event.justification ?? null,
        metadata: event.metadata ? (event.metadata as Prisma.InputJsonValue) : Prisma.JsonNull,
      },
    });
  }
}
