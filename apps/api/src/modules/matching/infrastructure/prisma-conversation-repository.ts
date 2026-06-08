// T014 [US1] — PrismaConversationRepository (port ConversationRepo).
// Idempotence : createConversation (UNIQUE leadId) + appendMessage (UNIQUE
// conversationId × idempotencyKey) → P2002 traité en `duplicate`. Aucune donnée
// transactionnelle.

import { Prisma, prisma } from '@cv/db';
import type { ConversationParticipant } from '@cv/shared/matching';
import { Injectable } from '@nestjs/common';
import type {
  AppendMessageInput,
  AppendMessageResult,
  AttachmentRecord,
  AttachmentStatus,
  ConversationRecord,
  ConversationRepo,
  CreateAttachmentInput,
  CreateConversationInput,
  CreateConversationResult,
  ListMessagesResult,
  MessageRecord,
  MessageRef,
} from '../application/ports';

function isUniqueViolation(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
}

@Injectable()
export class PrismaConversationRepository implements ConversationRepo {
  async findByLeadId(leadId: string): Promise<ConversationRecord | null> {
    const c = await prisma.conversation.findUnique({ where: { leadId } });
    return c
      ? {
          id: c.id,
          leadId: c.leadId,
          conseillerId: c.conseillerId,
          briefId: c.briefId,
          voyageurRef: c.voyageurRef,
        }
      : null;
  }

  async createConversation(input: CreateConversationInput): Promise<CreateConversationResult> {
    try {
      const c = await prisma.conversation.create({
        data: {
          id: input.id,
          leadId: input.leadId,
          conseillerId: input.conseillerId,
          briefId: input.briefId,
          voyageurRef: input.voyageurRef,
          openedAt: input.openedAt,
        },
      });
      return { kind: 'created', conversationId: c.id };
    } catch (e) {
      if (isUniqueViolation(e)) {
        const existing = await prisma.conversation.findUnique({ where: { leadId: input.leadId } });
        if (existing) return { kind: 'duplicate', conversationId: existing.id };
      }
      throw e;
    }
  }

  async findById(id: string): Promise<ConversationRecord | null> {
    const c = await prisma.conversation.findUnique({ where: { id } });
    return c
      ? {
          id: c.id,
          leadId: c.leadId,
          conseillerId: c.conseillerId,
          briefId: c.briefId,
          voyageurRef: c.voyageurRef,
        }
      : null;
  }

  async appendMessage(input: AppendMessageInput): Promise<AppendMessageResult> {
    try {
      const m = await prisma.conversationMessage.create({
        data: {
          id: input.id,
          conversationId: input.conversationId,
          author: input.author,
          body: input.body,
          idempotencyKey: input.idempotencyKey,
          createdAt: input.createdAt,
        },
      });
      return { kind: 'created', messageId: m.id };
    } catch (e) {
      if (isUniqueViolation(e)) {
        const existing = await prisma.conversationMessage.findFirst({
          where: { conversationId: input.conversationId, idempotencyKey: input.idempotencyKey },
        });
        if (existing) return { kind: 'duplicate', messageId: existing.id };
      }
      throw e;
    }
  }

  async listMessages(
    conversationId: string,
    page: number,
    pageSize: number,
  ): Promise<ListMessagesResult> {
    const [rows, total] = await Promise.all([
      prisma.conversationMessage.findMany({
        where: { conversationId },
        orderBy: { createdAt: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.conversationMessage.count({ where: { conversationId } }),
    ]);
    const items: MessageRecord[] = rows.map((m) => ({
      id: m.id,
      author: m.author as ConversationParticipant,
      body: m.body,
      createdAt: m.createdAt,
    }));
    return { items, total };
  }

  async touchLastMessageAt(conversationId: string, at: Date): Promise<void> {
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: at },
    });
  }

  // --- Pièces jointes (US2) ---

  async findMessageById(messageId: string): Promise<MessageRef | null> {
    const m = await prisma.conversationMessage.findUnique({
      where: { id: messageId },
      select: { id: true, conversationId: true },
    });
    return m ? { id: m.id, conversationId: m.conversationId } : null;
  }

  async createAttachment(input: CreateAttachmentInput): Promise<void> {
    await prisma.conversationAttachment.create({
      data: {
        id: input.id,
        messageId: input.messageId,
        fileName: input.fileName,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        s3Key: input.s3Key,
        status: 'pending_upload',
      },
    });
  }

  async findAttachmentById(id: string): Promise<AttachmentRecord | null> {
    const a = await prisma.conversationAttachment.findUnique({
      where: { id },
      select: {
        id: true,
        messageId: true,
        fileName: true,
        mimeType: true,
        sizeBytes: true,
        s3Key: true,
        status: true,
        deletedAt: true,
        message: { select: { conversationId: true } },
      },
    });
    if (!a) return null;
    return {
      id: a.id,
      messageId: a.messageId,
      conversationId: a.message.conversationId,
      fileName: a.fileName,
      mimeType: a.mimeType,
      sizeBytes: a.sizeBytes,
      s3Key: a.s3Key,
      status: a.status as AttachmentStatus,
      deletedAt: a.deletedAt,
    };
  }

  async finalizeAttachment(id: string): Promise<void> {
    await prisma.conversationAttachment.update({ where: { id }, data: { status: 'ready' } });
  }

  async listAttachmentsByConversation(
    conversationId: string,
  ): Promise<ReadonlyArray<AttachmentRecord>> {
    const rows = await prisma.conversationAttachment.findMany({
      where: { message: { conversationId }, deletedAt: null },
      select: {
        id: true,
        messageId: true,
        fileName: true,
        mimeType: true,
        sizeBytes: true,
        s3Key: true,
        status: true,
        deletedAt: true,
      },
    });
    return rows.map((a) => ({
      id: a.id,
      messageId: a.messageId,
      conversationId,
      fileName: a.fileName,
      mimeType: a.mimeType,
      sizeBytes: a.sizeBytes,
      s3Key: a.s3Key,
      status: a.status as AttachmentStatus,
      deletedAt: a.deletedAt,
    }));
  }

  async markAttachmentDeleted(id: string, at: Date): Promise<void> {
    await prisma.conversationAttachment.update({ where: { id }, data: { deletedAt: at } });
  }
}
