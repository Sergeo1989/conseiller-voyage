// T024 [TDD GREEN] — ConsumeMatchingEventUseCase (US1 P1 MVP).
//
// Pipeline : dédup (consumed-events) → pour chaque entry, re-filtre verified
// (ConformiteQueryPort) → crée le lead (idempotent UNIQUE conseiller × MR) →
// enqueue une notification (pending si vérifié, skipped_unverified sinon).
// Double barrière d'idempotence (ADR-0026) : consumed-events + UNIQUE DB.
//
// `unmatched` → trace seule (aucun lead/notification). `all_matches_revoked`
// et la supersession re-match sont traités en Phase 5 (T047/T048).

import type { ConformiteQueryPort } from '@cv/shared/conformite';
import {
  type MatchingEventBusName,
  OutboxAllMatchesRevokedPayloadSchema,
  OutboxMatchedPayloadSchema,
  OutboxPartiallyMatchedPayloadSchema,
  OutboxUnmatchedPayloadSchema,
} from '@cv/shared/matching';
import type { Clock } from '../../../../common/ports/clock.port';
import type { UuidGenerator } from '../../../../common/ports/uuid-generator.port';
import type { ConsumedEventStore, LeadNotificationOutboxPort, LeadWriter } from '../ports';

export interface ConsumeMatchingEventDeps {
  readonly clock: Clock;
  readonly uuid: UuidGenerator;
  readonly consumedEvents: ConsumedEventStore;
  readonly leadWriter: LeadWriter;
  readonly notificationOutbox: LeadNotificationOutboxPort;
  readonly conformiteQuery: ConformiteQueryPort;
}

export interface ConsumeMatchingEventInput {
  readonly name: MatchingEventBusName;
  readonly idempotencyKey: string;
  readonly payload: unknown;
}

export type ConsumeMatchingEventResult =
  | { readonly kind: 'duplicate' }
  | {
      readonly kind: 'processed';
      readonly leadsCreated: number;
      readonly notificationsPending: number;
      readonly skippedUnverified: number;
      /** Leads d'un MR antérieur du même brief clôturés (re-match, FR-018). */
      readonly supersededClosed: number;
    }
  | { readonly kind: 'unmatched' }
  | { readonly kind: 'revoked'; readonly leadsClosed: number }; // all_matches_revoked

interface NormalizedEntry {
  readonly position: 1 | 2 | 3;
  readonly conseillerId: string;
  readonly scoreFinal: number;
  readonly boosted: boolean;
}

export class ConsumeMatchingEventUseCase {
  static readonly DEPS_TOKEN = Symbol.for('ConsumeMatchingEventDeps');

  constructor(private readonly deps: ConsumeMatchingEventDeps) {}

  async execute(input: ConsumeMatchingEventInput): Promise<ConsumeMatchingEventResult> {
    if (await this.deps.consumedEvents.hasConsumed(input.idempotencyKey)) {
      return { kind: 'duplicate' };
    }

    if (input.name === 'voyageur.brief.all_matches_revoked') {
      return this.handleAllRevoked(input);
    }

    if (input.name === 'voyageur.brief.unmatched') {
      // Validation à la frontière (trace de cohérence), puis simple trace.
      OutboxUnmatchedPayloadSchema.parse(input.payload);
      await this.deps.consumedEvents.recordConsumed(input.idempotencyKey, input.name);
      return { kind: 'unmatched' };
    }

    return this.handleMatched(input);
  }

  /** all_matches_revoked : clôture les leads du MR en `perdu`, aucune notification. */
  private async handleAllRevoked(
    input: ConsumeMatchingEventInput,
  ): Promise<ConsumeMatchingEventResult> {
    const p = OutboxAllMatchesRevokedPayloadSchema.parse(input.payload);
    const leadsClosed = await this.deps.leadWriter.closeLeadsSystem({
      matchingResultId: p.matchingResultId,
      reason: 'all_matches_revoked',
      occurredAt: this.deps.clock.now(),
    });
    await this.deps.consumedEvents.recordConsumed(input.idempotencyKey, input.name);
    return { kind: 'revoked', leadsClosed };
  }

  /** matched / partially_matched : supersession (FR-018) + leads + notifications. */
  private async handleMatched(
    input: ConsumeMatchingEventInput,
  ): Promise<ConsumeMatchingEventResult> {
    const { matchingResultId, briefId, entries } = this.parseMatched(input);

    // Supersession re-match : clôture les leads non terminaux d'un MR antérieur.
    const supersededClosed = await this.deps.leadWriter.closeSupersededLeadsForBrief({
      briefId,
      currentMatchingResultId: matchingResultId,
      reason: 're-matched',
      occurredAt: this.deps.clock.now(),
    });

    let leadsCreated = 0;
    let notificationsPending = 0;
    let skippedUnverified = 0;

    for (const entry of entries) {
      const outcome = await this.processEntry(matchingResultId, briefId, entry);
      if (outcome.leadCreated) leadsCreated += 1;
      if (outcome.verified) notificationsPending += 1;
      else skippedUnverified += 1;
    }

    await this.deps.consumedEvents.recordConsumed(input.idempotencyKey, input.name);

    return {
      kind: 'processed',
      leadsCreated,
      notificationsPending,
      skippedUnverified,
      supersededClosed,
    };
  }

  /** Crée le lead + enqueue la notification pour une entry (idempotent). */
  private async processEntry(
    matchingResultId: string,
    briefId: string,
    entry: NormalizedEntry,
  ): Promise<{ leadCreated: boolean; verified: boolean }> {
    const now = this.deps.clock.now();
    const status = await this.deps.conformiteQuery.getVerificationStatus({
      conseillerId: entry.conseillerId,
      strict: true,
    });

    const created = await this.deps.leadWriter.createLead({
      id: this.deps.uuid.generate(),
      matchingResultId,
      matchingResultEntryPosition: entry.position,
      conseillerId: entry.conseillerId,
      briefId,
      scoreFinal: entry.scoreFinal,
      boosted: entry.boosted,
      createdAt: now,
    });

    await this.deps.notificationOutbox.enqueue({
      id: this.deps.uuid.generate(),
      leadId: created.leadId,
      conseillerId: entry.conseillerId,
      idempotencyKey: `lead:${entry.conseillerId}:${matchingResultId}`,
      status: status.verified ? 'pending' : 'skipped_unverified',
      createdAt: now,
    });

    return { leadCreated: created.kind === 'created', verified: status.verified };
  }

  private parseMatched(input: ConsumeMatchingEventInput): {
    matchingResultId: string;
    briefId: string;
    entries: ReadonlyArray<NormalizedEntry>;
  } {
    if (input.name === 'voyageur.brief.matched') {
      const p = OutboxMatchedPayloadSchema.parse(input.payload);
      return { matchingResultId: p.matchingResultId, briefId: p.briefId, entries: p.entries };
    }
    const p = OutboxPartiallyMatchedPayloadSchema.parse(input.payload);
    return { matchingResultId: p.matchingResultId, briefId: p.briefId, entries: p.entries };
  }
}
