// T013 — Port LeadNotificationOutbox (file des notifications conseiller).
//
// Pattern outbox : enqueue idempotent (UNIQUE idempotencyKey =
// `lead:{conseillerId}:{matchingResultId}`), scan des pending par le job
// BullMQ (un job par destinataire), markSent / markFailed (backoff).

import type { LeadNotificationStatus } from '@cv/shared/matching';

export interface EnqueueNotificationInput {
  readonly id: string;
  readonly leadId: string;
  readonly conseillerId: string;
  /** `lead:{conseillerId}:{matchingResultId}` — idempotence FR-003. */
  readonly idempotencyKey: string;
  /** `pending` (à envoyer) ou `skipped_unverified` (tracé, non notifié). */
  readonly status: Extract<LeadNotificationStatus, 'pending' | 'skipped_unverified'>;
  readonly createdAt: Date;
}

export type EnqueueNotificationResult =
  | { readonly kind: 'enqueued' }
  | { readonly kind: 'duplicate' }; // UNIQUE idempotencyKey

/** Entrée pending à acheminer (lue par le job). */
export interface PendingNotification {
  readonly id: string;
  readonly leadId: string;
  readonly conseillerId: string;
  readonly idempotencyKey: string;
  readonly attempts: number;
}

export interface LeadNotificationOutboxPort {
  enqueue(input: EnqueueNotificationInput): Promise<EnqueueNotificationResult>;

  scanPending(limit: number): Promise<ReadonlyArray<PendingNotification>>;

  markSent(notificationId: string, sentAt: Date): Promise<void>;

  markFailed(notificationId: string, error: string): Promise<void>;
}

export const LEAD_NOTIFICATION_OUTBOX = Symbol.for('LeadNotificationOutbox');
