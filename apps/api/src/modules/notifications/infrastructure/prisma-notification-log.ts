// T049 — PrismaNotificationLog adapter.
//
// Idempotence insert : catch Prisma P2002 sur correlationId unique.
// Toutes les dates renvoyées sont des Date JS (pas ISO string).

import { prisma } from '@cv/db';
import { Prisma } from '@cv/db';
import { Injectable } from '@nestjs/common';
import type { NotificationLogReader } from '../application/ports/notification-log-reader.port';
import type {
  AnonymizeInput,
  InsertLogInput,
  NotificationLogWriter,
  UpdateStatusInput,
} from '../application/ports/notification-log-writer.port';
import type { NotificationLogEntry } from '../domain/entities/notification-log-entry.entity';

type StatusTimestampField = {
  sentAt?: Date;
  deliveredAt?: Date;
  bouncedAt?: Date;
  complainedAt?: Date;
  failedAt?: Date;
};

function timestampFieldForStatus(
  status: UpdateStatusInput['status'],
  timestamp: Date,
): StatusTimestampField {
  if (status === 'sent') return { sentAt: timestamp };
  if (status === 'delivered') return { deliveredAt: timestamp };
  if (status === 'bounced') return { bouncedAt: timestamp };
  if (status === 'complained') return { complainedAt: timestamp };
  if (status === 'failed' || status === 'dead_letter' || status === 'rendering_failed')
    return { failedAt: timestamp };
  return {};
}

@Injectable()
export class PrismaNotificationLog implements NotificationLogWriter, NotificationLogReader {
  async insert(input: InsertLogInput): Promise<{ id: string; created: boolean }> {
    try {
      const row = await prisma.notificationLogEntry.create({
        data: {
          id: input.id,
          correlationId: input.correlationId,
          sourceModule: input.sourceModule,
          eventType: input.eventType,
          templateId: input.templateId,
          recipientEmailClear: input.recipientEmailClear,
          recipientEmailCanonical: input.recipientEmailCanonical,
          recipientEmailHashHMAC: input.recipientEmailHashHMAC,
          recipientLocale: input.recipientLocale,
          enqueuedAt: input.enqueuedAt,
          status: input.status,
          ...(input.templateData !== undefined && {
            templateData: input.templateData as unknown as Prisma.InputJsonValue,
          }),
        },
      });
      return { id: row.id, created: true };
    } catch (err: unknown) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const existing = await prisma.notificationLogEntry.findUniqueOrThrow({
          where: { correlationId: input.correlationId },
          select: { id: true },
        });
        return { id: existing.id, created: false };
      }
      throw err;
    }
  }

  async updateStatus(input: UpdateStatusInput): Promise<void> {
    await prisma.notificationLogEntry.update({
      where: { correlationId: input.correlationId },
      data: {
        status: input.status,
        ...(input.sesMessageId !== undefined && { sesMessageId: input.sesMessageId }),
        ...(input.lastError !== undefined && { lastError: input.lastError }),
        ...(input.nextAttemptAt !== undefined && { nextAttemptAt: input.nextAttemptAt }),
        ...(input.attempts !== undefined && { attempts: input.attempts }),
        ...timestampFieldForStatus(input.status, input.timestamp),
      },
    });
  }

  async anonymizeByEmailHash(input: AnonymizeInput): Promise<number> {
    const result = await prisma.notificationLogEntry.updateMany({
      where: {
        recipientEmailHashHMAC: input.recipientEmailHashHMAC,
        erasedAt: null,
      },
      data: {
        recipientEmailClear: null,
        recipientEmailCanonical: null,
        htmlBody: null,
        textBody: null,
        erasedAt: input.now,
      },
    });
    return result.count;
  }

  async findById(id: string): Promise<NotificationLogEntry | null> {
    const row = await prisma.notificationLogEntry.findUnique({ where: { id } });
    return row as NotificationLogEntry | null;
  }

  async findByCorrelationId(correlationId: string): Promise<NotificationLogEntry | null> {
    const row = await prisma.notificationLogEntry.findUnique({
      where: { correlationId },
    });
    return row as NotificationLogEntry | null;
  }

  async findBySesMessageId(sesMessageId: string): Promise<NotificationLogEntry | null> {
    const row = await prisma.notificationLogEntry.findFirst({
      where: { sesMessageId },
    });
    return row as NotificationLogEntry | null;
  }

  async listDeadLetter(filters: {
    sourceModule?: 'conformite' | 'identite' | 'intake' | 'matching' | 'facturation';
    page: number;
    pageSize: number;
  }): Promise<{ items: ReadonlyArray<NotificationLogEntry>; totalCount: number }> {
    const where = {
      status: 'dead_letter' as const,
      ...(filters.sourceModule && { sourceModule: filters.sourceModule }),
    };
    const [items, totalCount] = await Promise.all([
      prisma.notificationLogEntry.findMany({
        where,
        skip: (filters.page - 1) * filters.pageSize,
        take: filters.pageSize,
        orderBy: { updatedAt: 'desc' },
      }),
      prisma.notificationLogEntry.count({ where }),
    ]);
    return { items: items as ReadonlyArray<NotificationLogEntry>, totalCount };
  }

  async metricsSnapshot(windowHours: number): Promise<{
    sent: number;
    delivered: number;
    bounced: { total: number; hard: number; soft: number };
    complained: number;
    failed: number;
    deadLetter: number;
    topTemplatesByBounceRate: ReadonlyArray<{
      templateId: string;
      bounces: number;
      sent: number;
      rate: number;
    }>;
  }> {
    const since = new Date(Date.now() - windowHours * 3600 * 1000);
    const [sent, delivered, bounced, complained, failed, deadLetter] = await Promise.all([
      prisma.notificationLogEntry.count({ where: { createdAt: { gte: since }, status: 'sent' } }),
      prisma.notificationLogEntry.count({
        where: { createdAt: { gte: since }, status: 'delivered' },
      }),
      prisma.notificationLogEntry.count({
        where: { createdAt: { gte: since }, status: 'bounced' },
      }),
      prisma.notificationLogEntry.count({
        where: { createdAt: { gte: since }, status: 'complained' },
      }),
      prisma.notificationLogEntry.count({ where: { createdAt: { gte: since }, status: 'failed' } }),
      prisma.notificationLogEntry.count({
        where: { createdAt: { gte: since }, status: 'dead_letter' },
      }),
    ]);
    return {
      sent,
      delivered,
      bounced: { total: bounced, hard: 0, soft: 0 },
      complained,
      failed,
      deadLetter,
      topTemplatesByBounceRate: [],
    };
  }

  async countByStatus(
    status: import('../domain/enums/notification-status.enum').NotificationStatus,
  ): Promise<number> {
    return prisma.notificationLogEntry.count({ where: { status } });
  }

  async countRecentBounces(recipientEmailHashHMAC: string, since: Date): Promise<number> {
    return prisma.notificationLogEntry.count({
      where: {
        recipientEmailHashHMAC,
        status: 'bounced',
        bouncedAt: { gte: since },
      },
    });
  }

  async sweepOldEntries(beforeDate: Date): Promise<number> {
    const result = await prisma.notificationLogEntry.updateMany({
      where: {
        sentAt: { lt: beforeDate },
        erasedAt: null,
      },
      data: {
        recipientEmailClear: null,
        recipientEmailCanonical: null,
        htmlBody: null,
        textBody: null,
        erasedAt: new Date(),
      },
    });
    return result.count;
  }
}
