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

/** Référence minimale d'un message (autorisation d'ajout de pièce jointe). */
export interface MessageRef {
  readonly id: string;
  readonly conversationId: string;
}

/** Statut d'une pièce jointe (cf. schéma : pending_upload → ready). */
export type AttachmentStatus = 'pending_upload' | 'ready';

export interface CreateAttachmentInput {
  readonly id: string;
  readonly messageId: string;
  readonly fileName: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly s3Key: string;
}

export interface AttachmentRecord {
  readonly id: string;
  readonly messageId: string;
  readonly conversationId: string;
  readonly fileName: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly s3Key: string;
  readonly status: AttachmentStatus;
  readonly deletedAt: Date | null;
}

export interface ConversationRepo {
  findByLeadId(leadId: string): Promise<ConversationRecord | null>;
  createConversation(input: CreateConversationInput): Promise<CreateConversationResult>;
  findById(id: string): Promise<ConversationRecord | null>;
  appendMessage(input: AppendMessageInput): Promise<AppendMessageResult>;
  listMessages(conversationId: string, page: number, pageSize: number): Promise<ListMessagesResult>;
  touchLastMessageAt(conversationId: string, at: Date): Promise<void>;

  // --- Pièces jointes (US2) ---
  findMessageById(messageId: string): Promise<MessageRef | null>;
  createAttachment(input: CreateAttachmentInput): Promise<void>;
  findAttachmentById(id: string): Promise<AttachmentRecord | null>;
  /** Passe une pièce jointe à `ready` (rattachée au message après upload S3). */
  finalizeAttachment(id: string): Promise<void>;
  /** Pièces jointes non supprimées d'un fil (cascade Loi 25, US3). */
  listAttachmentsByConversation(conversationId: string): Promise<ReadonlyArray<AttachmentRecord>>;
  /** Marque supprimée (objet S3 effacé par ailleurs) — métadonnées d'audit conservées. */
  markAttachmentDeleted(id: string, at: Date): Promise<void>;

  // --- Anonymisation Loi 25 (US3) — neutralise la PII, conserve l'audit ---
  /** Met à `null` le corps des messages encore renseignés ; renvoie le nombre neutralisé. */
  anonymizeMessageBodies(conversationId: string): Promise<number>;
  /** Neutralise les références voyageur du fil (`briefId`, `voyageurRef` → null). */
  neutralizeConversationRefs(conversationId: string): Promise<void>;
}

export const CONVERSATION_REPO = Symbol.for('ConversationRepo');
