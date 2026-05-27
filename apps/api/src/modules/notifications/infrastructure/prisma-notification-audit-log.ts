// T123 — PrismaNotificationAuditLog : writer + reader pour la console admin.

import { prisma } from '@cv/db';
import type { Prisma } from '@cv/db';
import { Injectable } from '@nestjs/common';
import type {
  AuditEntry,
  NotificationAuditLogReader,
} from '../application/ports/notification-audit-log-reader.port';
import type {
  AppendAuditInput,
  NotificationAuditLogWriter,
} from '../application/ports/notification-audit-log-writer.port';

@Injectable()
export class PrismaNotificationAuditLog
  implements NotificationAuditLogWriter, NotificationAuditLogReader
{
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

  async list(filters: {
    cursor?: string;
    pageSize: number;
    eventType?: string;
    actorId?: string;
  }): Promise<{ items: ReadonlyArray<AuditEntry>; nextCursor: string | null }> {
    const rows = await prisma.notificationAuditEntry.findMany({
      where: {
        ...(filters.cursor && { id: { lt: filters.cursor } }),
        ...(filters.eventType && { eventType: filters.eventType }),
        ...(filters.actorId && { actorId: filters.actorId }),
      },
      orderBy: { occurredAt: 'desc' },
      take: filters.pageSize + 1,
    });

    const hasMore = rows.length > filters.pageSize;
    const items = hasMore ? rows.slice(0, filters.pageSize) : rows;
    const nextCursor = hasMore ? (items.at(-1)?.id ?? null) : null;

    return {
      items: items as ReadonlyArray<AuditEntry>,
      nextCursor,
    };
  }
}
