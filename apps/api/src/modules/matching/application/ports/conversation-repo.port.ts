// T007 — Port `ConversationRepo` (persistance des fils + messages).
// Lit/écrit conversations et messages ; idempotence d'envoi par
// (conversationId, idempotencyKey). Aucun champ transactionnel.

import type { ConversationParticipant } from '@cv/shared/matching';

export interface ConversationRecord {
  readonly id: string;
  readonly leadId: string;
  readonly conseillerId: string;
  readonly briefId: string | null;
  readonly voyageurRef: string | null;
}

export interface CreateConversationInput {
  readonly id: string;
  readonly leadId: string;
  readonly conseillerId: string;
  readonly briefId: string | null;
  readonly voyageurRef: string | null;
  readonly openedAt: Date;
}

export type CreateConversationResult =
  | { readonly kind: 'created'; readonly conversationId: string }
  | { readonly kind: 'duplicate'; readonly conversationId: string }; // UNIQUE(leadId)

export interface AppendMessageInput {
  readonly id: string;
  readonly conversationId: string;
  readonly author: ConversationParticipant;
  readonly body: string;
  readonly idempotencyKey: string;
  readonly createdAt: Date;
}

export type AppendMessageResult =
  | { readonly kind: 'created'; readonly messageId: string }
  | { readonly kind: 'duplicate'; readonly messageId: string }; // UNIQUE(conversationId, idempotencyKey)

export interface MessageRecord {
  readonly id: string;
  readonly author: ConversationParticipant;
  readonly body: string | null; // null si anonymisé Loi 25
  readonly createdAt: Date;
}

export interface ListMessagesResult {
  readonly items: ReadonlyArray<MessageRecord>;
  readonly total: number;
}

export interface ConversationRepo {
  findByLeadId(leadId: string): Promise<ConversationRecord | null>;
  createConversation(input: CreateConversationInput): Promise<CreateConversationResult>;
  findById(id: string): Promise<ConversationRecord | null>;
  appendMessage(input: AppendMessageInput): Promise<AppendMessageResult>;
  listMessages(conversationId: string, page: number, pageSize: number): Promise<ListMessagesResult>;
  touchLastMessageAt(conversationId: string, at: Date): Promise<void>;
}

export const CONVERSATION_REPO = Symbol.for('ConversationRepo');
