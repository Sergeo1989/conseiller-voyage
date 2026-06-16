// T007 [017] — PrismaVoyageurNotificationOutbox. Mirroir 012.
// enqueue idempotent (UNIQUE idempotencyKey), scan pending, mark sent/failed,
// annulation Loi 25. Aucune PII conseiller (conseillerIds = IDs techniques).

import { prisma } from '@cv/db';
import type { MatchOutcome } from '@cv/shared/intake';
import { Injectable } from '@nestjs/common';
import type {
  EnqueueVoyageurNotificationInput,
  EnqueueVoyageurNotificationResult,
  PendingVoyageurNotification,
  VoyageurNotificationOutbox,
} from '../application/ports';

@Injectable()
export class PrismaVoyageurNotificationOutbox implements VoyageurNotificationOutbox {
  async enqueue(
    input: EnqueueVoyageurNotificationInput,
  ): Promise<EnqueueVoyageurNotificationResult> {
    try {
      await prisma.voyageurNotification.create({
        data: {
          id: input.id,
          briefId: input.briefId,
          type: input.type,
          status: 'en_attente',
          idempotencyKey: input.idempotencyKey,
          outcome: input.outcome ?? null,
          conseillerIds: [...input.conseillerIds],
          createdAt: input.createdAt,
        },
      });
      return { kind: 'enqueued' };
    } catch (err) {
      if (isUniqueViolation(err)) return { kind: 'duplicate' };
      throw err;
    }
  }

  async lastOutcomeForBrief(briefId: string): Promise<MatchOutcome | null> {
    const row = await prisma.voyageurNotification.findFirst({
      where: { briefId, outcome: { not: null } },
      orderBy: { createdAt: 'desc' },
      select: { outcome: true },
    });
    return (row?.outcome as MatchOutcome | undefined) ?? null;
  }

  async scanPending(limit: number): Promise<ReadonlyArray<PendingVoyageurNotification>> {
    const rows = await prisma.voyageurNotification.findMany({
      where: { status: 'en_attente' },
      orderBy: { createdAt: 'asc' },
      take: limit,
      select: {
        id: true,
        briefId: true,
        type: true,
        outcome: true,
        conseillerIds: true,
        attempts: true,
      },
    });
    return rows.map((r) => ({
      id: r.id,
      briefId: r.briefId,
      type: r.type,
      outcome: (r.outcome as MatchOutcome | null) ?? null,
      conseillerIds: (r.conseillerIds as string[] | null) ?? [],
      attempts: r.attempts,
    }));
  }

  async markSent(notificationId: string, sentAt: Date): Promise<void> {
    await prisma.voyageurNotification.update({
      where: { id: notificationId },
      data: { status: 'envoyee', sentAt },
    });
  }

  async markFailed(notificationId: string, error: string): Promise<void> {
    await prisma.voyageurNotification.update({
      where: { id: notificationId },
      data: { status: 'echouee', attempts: { increment: 1 }, lastError: error.slice(0, 1000) },
    });
  }

  async cancelPendingForBrief(briefId: string): Promise<number> {
    const { count } = await prisma.voyageurNotification.updateMany({
      where: { briefId, status: 'en_attente' },
      data: { status: 'annulee' },
    });
    return count;
  }
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002';
}
