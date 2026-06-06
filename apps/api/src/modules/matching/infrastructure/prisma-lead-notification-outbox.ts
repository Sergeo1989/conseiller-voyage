// T026 [US1] — PrismaLeadNotificationOutbox.
// File des notifications conseiller (un job par destinataire). enqueue
// idempotent (UNIQUE idempotencyKey), scan des pending, markSent/markFailed.

import { prisma } from '@cv/db';
import { Injectable } from '@nestjs/common';
import type {
  EnqueueNotificationInput,
  EnqueueNotificationResult,
  LeadNotificationOutboxPort,
  PendingNotification,
} from '../application/ports';

@Injectable()
export class PrismaLeadNotificationOutbox implements LeadNotificationOutboxPort {
  async enqueue(input: EnqueueNotificationInput): Promise<EnqueueNotificationResult> {
    try {
      await prisma.leadNotificationOutbox.create({
        data: {
          id: input.id,
          leadId: input.leadId,
          conseillerId: input.conseillerId,
          idempotencyKey: input.idempotencyKey,
          status: input.status,
          createdAt: input.createdAt,
        },
      });
      return { kind: 'enqueued' };
    } catch (err) {
      if (isUniqueViolation(err)) return { kind: 'duplicate' };
      throw err;
    }
  }

  async scanPending(limit: number): Promise<ReadonlyArray<PendingNotification>> {
    const rows = await prisma.leadNotificationOutbox.findMany({
      where: { status: 'pending' },
      orderBy: { createdAt: 'asc' },
      take: limit,
      select: {
        id: true,
        leadId: true,
        conseillerId: true,
        idempotencyKey: true,
        attempts: true,
      },
    });
    return rows;
  }

  async markSent(notificationId: string, sentAt: Date): Promise<void> {
    await prisma.leadNotificationOutbox.update({
      where: { id: notificationId },
      data: { status: 'sent', sentAt },
    });
  }

  async markFailed(notificationId: string, error: string): Promise<void> {
    await prisma.leadNotificationOutbox.update({
      where: { id: notificationId },
      data: { status: 'failed', attempts: { increment: 1 }, lastError: error.slice(0, 1000) },
    });
  }
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002';
}
