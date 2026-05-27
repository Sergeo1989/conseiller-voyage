// T051 — PrismaNotificationAuditLogWriter.
//
// Insert append-only dans notification_audit_entries.
// Le trigger T009 (BEFORE UPDATE/DELETE) garantit l'immutabilité côté DB.
// Pattern hérité de PrismaAuditLogWriter du module conformite (001).

import { prisma } from '@cv/db';
import type { Prisma } from '@cv/db';
import { Injectable } from '@nestjs/common';
import type {
  AppendAuditInput,
  NotificationAuditLogWriter,
} from '../application/ports/notification-audit-log-writer.port';

@Injectable()
export class PrismaNotificationAuditLogWriter implements NotificationAuditLogWriter {
  async append(input: AppendAuditInput): Promise<void> {
    await prisma.notificationAuditEntry.create({
      data: {
        eventType: input.eventType,
        actorId: input.actorId,
        actorRole: input.actorRole,
        targetEmailHashHMAC: input.targetEmailHashHMAC ?? null,
        reason: input.reason ?? null,
        metadata: (input.metadata ?? {}) as unknown as Prisma.InputJsonValue,
      },
    });
  }
}
