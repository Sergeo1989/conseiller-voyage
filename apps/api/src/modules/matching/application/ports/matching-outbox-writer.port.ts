// T026 — Port MatchingOutboxWriter (outbox pattern transactionnel).
//
// L'adapter Prisma (T057 Phase 3) garantit que l'INSERT outbox vit dans
// la même transaction que la création du MatchingResult (idempotence +
// at-least-once delivery). Le drain est délégué au OutboxPublisherJob
// (extension feature 003, T093, cf. ADR-0024).
//
// L'UNIQUE INDEX sur idempotencyKey rejette tout doublon (ex. re-trigger
// `voyageur.brief.activated` pour le même briefId + algorithmVersion).

import type {
  MatchingOutboxEntryId,
  MatchingOutboxEventTypeEnum,
  OutboxAllMatchesRevokedPayload,
  OutboxMatchedPayload,
  OutboxPartiallyMatchedPayload,
  OutboxUnmatchedPayload,
} from '@cv/shared/matching';

/**
 * Discriminated union sur eventType — garantit que le payload match le bon
 * schema Zod côté consommateur.
 */
export type MatchingOutboxEntryInput =
  | {
      readonly id: MatchingOutboxEntryId;
      readonly eventType: 'voyageur_brief_matched';
      readonly payload: OutboxMatchedPayload;
      readonly idempotencyKey: string;
    }
  | {
      readonly id: MatchingOutboxEntryId;
      readonly eventType: 'voyageur_brief_partially_matched';
      readonly payload: OutboxPartiallyMatchedPayload;
      readonly idempotencyKey: string;
    }
  | {
      readonly id: MatchingOutboxEntryId;
      readonly eventType: 'voyageur_brief_unmatched';
      readonly payload: OutboxUnmatchedPayload;
      readonly idempotencyKey: string;
    }
  | {
      readonly id: MatchingOutboxEntryId;
      readonly eventType: 'voyageur_brief_all_matches_revoked';
      readonly payload: OutboxAllMatchesRevokedPayload;
      readonly idempotencyKey: string;
    };

export type MatchingOutboxEnqueueResult =
  | { readonly kind: 'enqueued' }
  | { readonly kind: 'duplicate' }; // idempotencyKey déjà existante

export interface MatchingOutboxWriter {
  enqueue(entry: MatchingOutboxEntryInput): Promise<MatchingOutboxEnqueueResult>;
}

export const MATCHING_OUTBOX_WRITER = Symbol.for('MatchingOutboxWriter');

// Réexport pour faciliter import unique côté use cases
export type { MatchingOutboxEventTypeEnum };
