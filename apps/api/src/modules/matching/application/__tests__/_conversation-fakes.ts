// T008 — Fakes en mémoire pour les use cases conversation (feature 014).
// Réutilise les fakes leads (FakeLeadReader/FakeConformiteQuery/FakeClock/
// FakeUuidGenerator/LeadFakeStore) via `_lead-fakes`.

import type { ConversationParticipant } from '@cv/shared/matching';
import type {
  AppendMessageInput,
  AppendMessageResult,
  ConversationNotificationOutbox,
  ConversationRecord,
  ConversationRepo,
  CreateConversationInput,
  CreateConversationResult,
  EnqueueConversationNotifInput,
  EnqueueConversationNotifResult,
  ListMessagesResult,
  MessageRecord,
} from '../ports';

interface StoredMessage {
  readonly id: string;
  readonly conversationId: string;
  readonly author: ConversationParticipant;
  readonly body: string | null;
  readonly idempotencyKey: string;
  readonly createdAt: Date;
}

export class FakeConversationRepo implements ConversationRepo {
  readonly conversations: ConversationRecord[] = [];
  readonly messages: StoredMessage[] = [];
  readonly lastMessageAt = new Map<string, Date>();

  async findByLeadId(leadId: string): Promise<ConversationRecord | null> {
    return this.conversations.find((c) => c.leadId === leadId) ?? null;
  }

  async createConversation(input: CreateConversationInput): Promise<CreateConversationResult> {
    const existing = this.conversations.find((c) => c.leadId === input.leadId);
    if (existing) return { kind: 'duplicate', conversationId: existing.id };
    this.conversations.push({
      id: input.id,
      leadId: input.leadId,
      conseillerId: input.conseillerId,
      briefId: input.briefId,
      voyageurRef: input.voyageurRef,
    });
    return { kind: 'created', conversationId: input.id };
  }

  async findById(id: string): Promise<ConversationRecord | null> {
    return this.conversations.find((c) => c.id === id) ?? null;
  }

  async appendMessage(input: AppendMessageInput): Promise<AppendMessageResult> {
    const dup = this.messages.find(
      (m) => m.conversationId === input.conversationId && m.idempotencyKey === input.idempotencyKey,
    );
    if (dup) return { kind: 'duplicate', messageId: dup.id };
    this.messages.push({
      id: input.id,
      conversationId: input.conversationId,
      author: input.author,
      body: input.body,
      idempotencyKey: input.idempotencyKey,
      createdAt: input.createdAt,
    });
    return { kind: 'created', messageId: input.id };
  }

  async listMessages(
    conversationId: string,
    page: number,
    pageSize: number,
  ): Promise<ListMessagesResult> {
    const all = this.messages
      .filter((m) => m.conversationId === conversationId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    const start = (page - 1) * pageSize;
    const items: MessageRecord[] = all
      .slice(start, start + pageSize)
      .map((m) => ({ id: m.id, author: m.author, body: m.body, createdAt: m.createdAt }));
    return { items, total: all.length };
  }

  async touchLastMessageAt(conversationId: string, at: Date): Promise<void> {
    this.lastMessageAt.set(conversationId, at);
  }
}

export class FakeConversationNotificationOutbox implements ConversationNotificationOutbox {
  readonly entries: Array<{
    readonly id: string;
    readonly messageId: string;
    readonly recipient: ConversationParticipant;
    readonly idempotencyKey: string;
  }> = [];

  async enqueue(input: EnqueueConversationNotifInput): Promise<EnqueueConversationNotifResult> {
    if (this.entries.some((e) => e.idempotencyKey === input.idempotencyKey)) {
      return { kind: 'duplicate' };
    }
    this.entries.push({
      id: input.id,
      messageId: input.messageId,
      recipient: input.recipient,
      idempotencyKey: input.idempotencyKey,
    });
    return { kind: 'created' };
  }
}
