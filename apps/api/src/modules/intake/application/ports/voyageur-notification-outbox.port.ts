// T006 [017] — Port VoyageurNotificationOutbox (file des notifications voyageur).
// Mirroir de LeadNotificationOutbox (012). Enqueue idempotent (UNIQUE
// idempotencyKey = clé d'événement source) ; scan par le job BullMQ.

import type { MatchOutcome, VoyageurNotificationType } from '@cv/shared/intake';

export interface EnqueueVoyageurNotificationInput {
  readonly id: string;
  readonly briefId: string;
  readonly type: VoyageurNotificationType;
  readonly idempotencyKey: string;
  readonly outcome: MatchOutcome | null;
  readonly conseillerIds: ReadonlyArray<string>;
  readonly createdAt: Date;
}

export type EnqueueVoyageurNotificationResult =
  | { readonly kind: 'enqueued' }
  | { readonly kind: 'duplicate' }; // UNIQUE idempotencyKey

export interface PendingVoyageurNotification {
  readonly id: string;
  readonly briefId: string;
  readonly type: VoyageurNotificationType;
  readonly outcome: MatchOutcome | null;
  readonly conseillerIds: ReadonlyArray<string>;
  readonly attempts: number;
}

export interface VoyageurNotificationOutbox {
  enqueue(input: EnqueueVoyageurNotificationInput): Promise<EnqueueVoyageurNotificationResult>;
  /** Dernière issue notifiée pour ce brief (anti-spam FR-014) ; null si aucune. */
  lastOutcomeForBrief(briefId: string): Promise<MatchOutcome | null>;
  scanPending(limit: number): Promise<ReadonlyArray<PendingVoyageurNotification>>;
  markSent(notificationId: string, sentAt: Date): Promise<void>;
  markFailed(notificationId: string, error: string): Promise<void>;
  /** Loi 25 (FR-010) : annule les notifications en attente d'un brief effacé. */
  cancelPendingForBrief(briefId: string): Promise<void>;
}

export const VOYAGEUR_NOTIFICATION_OUTBOX = Symbol.for('VoyageurNotificationOutbox');
