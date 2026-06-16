// Port IntakeOutboxWriter — pattern outbox transactionnel.
// L'adapter Prisma (T054) garantit que l'INSERT outbox vit dans la
// même transaction que la mutation brief (idempotence + at-least-once).
// Le drain est délégué à OutboxPublisherJob (étendu depuis 001, T134).

import type { IntakeOutboxEntryId } from '@cv/shared/intake';

export type IntakeOutboxEventType =
  | 'voyageur.brief.activated'
  // T007 [016] — publié par EnrichBriefJob après l'enrichissement (toujours,
  // même en fallback) ; consommé par le matching repointé (déclenche le scoring).
  | 'voyageur.brief.enriched'
  | 'voyageur.brief.deleted'
  | 'voyageur.brief.expired'
  | 'voyageur.brief.pushed_manual';

export interface IntakeOutboxEntryInput {
  readonly id: IntakeOutboxEntryId;
  readonly eventType: IntakeOutboxEventType;
  readonly payload: Record<string, unknown>;
}

export interface IntakeOutboxWriter {
  enqueue(entry: IntakeOutboxEntryInput): Promise<void>;
}

export const INTAKE_OUTBOX_WRITER = Symbol.for('IntakeOutboxWriter');
