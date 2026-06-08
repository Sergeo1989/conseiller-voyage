// T007 — Port `ConversationNotificationOutbox` (1 entrée par destinataire, FR-003).
// Idempotent par `idempotencyKey` (couple message × destinataire). Drainé vers
// SES (003) par un job BullMQ.

import type { ConversationParticipant } from '@cv/shared/matching';

export interface EnqueueConversationNotifInput {
  readonly id: string;
  readonly messageId: string;
  readonly recipient: ConversationParticipant;
  readonly idempotencyKey: string;
  readonly createdAt: Date;
}

export type EnqueueConversationNotifResult =
  | { readonly kind: 'created' }
  | { readonly kind: 'duplicate' };

/** Notification en attente d'envoi (drain → job BullMQ par destinataire). */
export interface PendingConversationNotif {
  readonly id: string;
  readonly messageId: string;
  readonly conversationId: string;
  readonly recipient: ConversationParticipant;
}

export interface ConversationNotificationOutbox {
  enqueue(input: EnqueueConversationNotifInput): Promise<EnqueueConversationNotifResult>;
  /** Notifications `pending` les plus anciennes (FIFO), au plus `limit`. */
  scanPending(limit: number): Promise<ReadonlyArray<PendingConversationNotif>>;
  /** Marque `sent` (idempotent : ne ré-échoue pas si déjà sent). */
  markSent(id: string, at: Date): Promise<void>;
  /** Marque `failed` + incrémente `attempts` + journalise `lastError`. */
  markFailed(id: string, error: string): Promise<void>;
}

export const CONVERSATION_NOTIFICATION_OUTBOX = Symbol.for('ConversationNotificationOutbox');
