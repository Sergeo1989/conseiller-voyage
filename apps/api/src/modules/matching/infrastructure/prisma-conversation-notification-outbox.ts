// T015 [US1] — PrismaConversationNotificationOutbox (port).
// 1 entrée par destinataire (UNIQUE idempotencyKey) → P2002 = duplicate.

import { Prisma, prisma } from '@cv/db';
import { Injectable } from '@nestjs/common';
import type {
  ConversationNotificationOutbox,
  EnqueueConversationNotifInput,
  EnqueueConversationNotifResult,
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
}
