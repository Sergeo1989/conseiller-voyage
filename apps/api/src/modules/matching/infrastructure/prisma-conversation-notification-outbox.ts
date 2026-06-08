// T015 [US1] — PrismaConversationNotificationOutbox (port).
// 1 entrée par destinataire (UNIQUE idempotencyKey) → P2002 = duplicate.

import { Prisma, prisma } from '@cv/db';
import type { ConversationParticipant } from '@cv/shared/matching';
import { Injectable } from '@nestjs/common';
import type {
  ConversationNotificationOutbox,
  EnqueueConversationNotifInput,
  EnqueueConversationNotifResult,
  PendingConversationNotif,
} from '../application/ports';

@Injectable()
export class PrismaConversationNotificationOutbox implements ConversationNotificationOutbox {
  async enqueue(input: EnqueueConversationNotifInput): Promise<EnqueueConversationNotifResult> {
    try {
      await prisma.conversationNotificationOutbox.create({
        data: {
          id: input.id,
          messageId: input.messageId,
          recipient: input.recipient,
          idempotencyKey: input.idempotencyKey,
          createdAt: input.createdAt,
        },
      });
      return { kind: 'created' };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        return { kind: 'duplicate' };
      }
      throw e;
    }
  }

  async scanPending(limit: number): Promise<ReadonlyArray<PendingConversationNotif>> {
    const rows = await prisma.conversationNotificationOutbox.findMany({
      where: { status: 'pending' },
      orderBy: { createdAt: 'asc' },
      take: limit,
      select: {
        id: true,
        messageId: true,
        recipient: true,
        message: { select: { conversationId: true } },
      },
    });
    return rows.map((r) => ({
      id: r.id,
      messageId: r.messageId,
      conversationId: r.message.conversationId,
      recipient: r.recipient as ConversationParticipant,
    }));
  }

  async markSent(id: string, at: Date): Promise<void> {
    await prisma.conversationNotificationOutbox.update({
      where: { id },
      data: { status: 'sent', sentAt: at },
    });
  }

  async markFailed(id: string, error: string): Promise<void> {
    await prisma.conversationNotificationOutbox.update({
      where: { id },
      data: { status: 'failed', attempts: { increment: 1 }, lastError: error.slice(0, 2000) },
    });
  }
}
