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

export interface ConversationNotificationOutbox {
  enqueue(input: EnqueueConversationNotifInput): Promise<EnqueueConversationNotifResult>;
}

export const CONVERSATION_NOTIFICATION_OUTBOX = Symbol.for('ConversationNotificationOutbox');
