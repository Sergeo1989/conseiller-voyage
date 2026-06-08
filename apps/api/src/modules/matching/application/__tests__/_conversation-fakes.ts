// T008 — Fakes en mémoire pour les use cases conversation (feature 014).
// Réutilise les fakes leads (FakeLeadReader/FakeConformiteQuery/FakeClock/
// FakeUuidGenerator/LeadFakeStore) via `_lead-fakes`.

import type { ConversationParticipant } from '@cv/shared/matching';
import type {
  AppendMessageInput,
  AppendMessageResult,
  AttachmentRecord,
  AttachmentStorage,
  ConversationNotificationOutbox,
  ConversationRecord,
  ConversationRepo,
  CreateAttachmentInput,
  CreateConversationInput,
  CreateConversationResult,
  EnqueueConversationNotifInput,
  EnqueueConversationNotifResult,
  ListMessagesResult,
  MessageRecord,
  MessageRef,
  PendingConversationNotif,
  PresignedUrl,
} from '../ports';

interface StoredMessage {
  readonly id: string;
  readonly conversationId: string;
  readonly author: ConversationParticipant;
  body: string | null;
  readonly idempotencyKey: string;
  readonly createdAt: Date;
}

interface StoredConversation {
  readonly id: string;
  readonly leadId: string;
  readonly conseillerId: string;
  briefId: string | null;
  voyageurRef: string | null;
}

interface StoredAttachment {
  id: string;
  messageId: string;
  conversationId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  s3Key: string;
  status: 'pending_upload' | 'ready';
  deletedAt: Date | null;
}

export class FakeConversationRepo implements ConversationRepo {
  readonly conversations: StoredConversation[] = [];
  readonly messages: StoredMessage[] = [];
  readonly attachments: StoredAttachment[] = [];
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

  async findMessageById(messageId: string): Promise<MessageRef | null> {
    const m = this.messages.find((x) => x.id === messageId);
    return m ? { id: m.id, conversationId: m.conversationId } : null;
  }

  async createAttachment(input: CreateAttachmentInput): Promise<void> {
    const message = this.messages.find((m) => m.id === input.messageId);
    this.attachments.push({
      id: input.id,
      messageId: input.messageId,
      conversationId: message?.conversationId ?? '',
      fileName: input.fileName,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      s3Key: input.s3Key,
      status: 'pending_upload',
      deletedAt: null,
    });
  }

  async findAttachmentById(id: string): Promise<AttachmentRecord | null> {
    const a = this.attachments.find((x) => x.id === id);
    return a ? { ...a } : null;
  }

  async finalizeAttachment(id: string): Promise<void> {
    const a = this.attachments.find((x) => x.id === id);
    if (a) a.status = 'ready';
  }

  async listAttachmentsByConversation(
    conversationId: string,
  ): Promise<ReadonlyArray<AttachmentRecord>> {
    return this.attachments
      .filter((a) => a.conversationId === conversationId && !a.deletedAt)
      .map((a) => ({ ...a }));
  }

  async markAttachmentDeleted(id: string, at: Date): Promise<void> {
    const a = this.attachments.find((x) => x.id === id);
    if (a) a.deletedAt = at;
  }

  async anonymizeMessageBodies(conversationId: string): Promise<number> {
    let count = 0;
    for (const m of this.messages) {
      if (m.conversationId === conversationId && m.body !== null) {
        m.body = null;
        count += 1;
      }
    }
    return count;
  }

  async neutralizeConversationRefs(conversationId: string): Promise<void> {
    const c = this.conversations.find((x) => x.id === conversationId);
    if (c) {
      c.briefId = null;
      c.voyageurRef = null;
    }
  }
}

/** Stockage objet en mémoire — enregistre les appels presign / delete. */
export class FakeAttachmentStorage implements AttachmentStorage {
  readonly uploads: string[] = [];
  readonly downloads: string[] = [];
  readonly deleted: string[] = [];

  async presignUpload(s3Key: string): Promise<PresignedUrl> {
    this.uploads.push(s3Key);
    return { url: `https://s3.fake/upload/${s3Key}`, expiresInSec: 300 };
  }

  async presignDownload(s3Key: string): Promise<PresignedUrl> {
    this.downloads.push(s3Key);
    return { url: `https://s3.fake/download/${s3Key}`, expiresInSec: 120 };
  }

  async deleteObject(s3Key: string): Promise<void> {
    this.deleted.push(s3Key);
  }
}

interface FakeNotifEntry {
  readonly id: string;
  readonly messageId: string;
  readonly recipient: ConversationParticipant;
  readonly idempotencyKey: string;
  /** Renseigné uniquement si seedé explicitement (l'enqueue ne le porte pas). */
  conversationId: string;
  status: 'pending' | 'sent' | 'failed';
  sentAt: Date | null;
  lastError: string | null;
}

export class FakeConversationNotificationOutbox implements ConversationNotificationOutbox {
  readonly entries: FakeNotifEntry[] = [];

  async enqueue(input: EnqueueConversationNotifInput): Promise<EnqueueConversationNotifResult> {
    if (this.entries.some((e) => e.idempotencyKey === input.idempotencyKey)) {
      return { kind: 'duplicate' };
    }
    this.entries.push({
      id: input.id,
      messageId: input.messageId,
      recipient: input.recipient,
      idempotencyKey: input.idempotencyKey,
      conversationId: '',
      status: 'pending',
      sentAt: null,
      lastError: null,
    });
    return { kind: 'created' };
  }

  async scanPending(limit: number): Promise<ReadonlyArray<PendingConversationNotif>> {
    return this.entries
      .filter((e) => e.status === 'pending')
      .slice(0, limit)
      .map((e) => ({
        id: e.id,
        messageId: e.messageId,
        conversationId: e.conversationId,
        recipient: e.recipient,
      }));
  }

  async markSent(id: string, at: Date): Promise<void> {
    const e = this.entries.find((x) => x.id === id);
    if (e) {
      e.status = 'sent';
      e.sentAt = at;
    }
  }

  async markFailed(id: string, error: string): Promise<void> {
    const e = this.entries.find((x) => x.id === id);
    if (e) {
      e.status = 'failed';
      e.lastError = error;
    }
  }
}
