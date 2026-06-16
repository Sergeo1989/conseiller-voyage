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
import type { MatchOutcome, VoyageurMatchNotifier } from '@cv/shared/intake';
import {
  type MatchingEventBusName,
  OutboxAllMatchesRevokedPayloadSchema,
  OutboxMatchedPayloadSchema,
  OutboxPartiallyMatchedPayloadSchema,
  OutboxUnmatchedPayloadSchema,
} from '@cv/shared/matching';
import { Logger } from '@nestjs/common';
import type { Clock } from '../../../../common/ports/clock.port';
import type { UuidGenerator } from '../../../../common/ports/uuid-generator.port';
import {
  type ConsumedEventStore,
  type LeadMetricsRecorder,
  type LeadNotificationOutboxPort,
  type LeadWriter,
  noopLeadMetricsRecorder,
} from '../ports';

export interface ConsumeMatchingEventDeps {
  readonly clock: Clock;
  readonly uuid: UuidGenerator;
  readonly consumedEvents: ConsumedEventStore;
  readonly leadWriter: LeadWriter;
  readonly notificationOutbox: LeadNotificationOutboxPort;
  readonly conformiteQuery: ConformiteQueryPort;
  /** Optionnel — no-op par défaut (tests). */
  readonly metrics?: LeadMetricsRecorder;
  /** Optionnel (017) — notifie le voyageur de l'issue ; no-op si absent. */
  readonly voyageurNotifier?: VoyageurMatchNotifier;
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

  private readonly logger = new Logger(ConsumeMatchingEventUseCase.name);
  private get metrics(): LeadMetricsRecorder {
    return this.deps.metrics ?? noopLeadMetricsRecorder;
  }

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
      const p = OutboxUnmatchedPayloadSchema.parse(input.payload);
      await this.deps.consumedEvents.recordConsumed(input.idempotencyKey, input.name);
      await this.notifyVoyageur(p.briefId, 'unmatched', [], input.idempotencyKey);
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
    for (let i = 0; i < leadsClosed; i += 1) this.metrics.recordLeadTransition('perdu');
    this.logger.log(`all_matches_revoked MR=${p.matchingResultId} → ${leadsClosed} lead(s) perdus`);
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

    const outcome: MatchOutcome =
      input.name === 'voyageur.brief.matched' ? 'matched' : 'partially_matched';
    await this.notifyVoyageur(
      briefId,
      outcome,
      entries.map((e) => e.conseillerId),
      input.idempotencyKey,
    );

    for (let i = 0; i < supersededClosed; i += 1) this.metrics.recordLeadTransition('perdu');
    this.logger.log(
      `matched MR=${matchingResultId} brief=${briefId} → ${leadsCreated} lead(s), ` +
        `${notificationsPending} notif, ${skippedUnverified} skip, ${supersededClosed} superseded`,
    );

    return {
      kind: 'processed',
      leadsCreated,
      notificationsPending,
      skippedUnverified,
      supersededClosed,
    };
  }

  /**
   * Rejoue la création des leads + notifications pour un MatchingResult donné
   * (sweep de réconciliation, mode dégradé bus HS — ADR-0026). Idempotent via
   * les contraintes UNIQUE DB ; ne touche PAS la dédup d'événements.
   */
  async replayMatchingResult(input: {
    matchingResultId: string;
    briefId: string;
    entries: ReadonlyArray<NormalizedEntry>;
  }): Promise<{ leadsCreated: number; notificationsPending: number; skippedUnverified: number }> {
    let leadsCreated = 0;
    let notificationsPending = 0;
    let skippedUnverified = 0;
    for (const entry of input.entries) {
      const outcome = await this.processEntry(input.matchingResultId, input.briefId, entry);
      if (outcome.leadCreated) leadsCreated += 1;
      if (outcome.verified) notificationsPending += 1;
      else skippedUnverified += 1;
    }
    return { leadsCreated, notificationsPending, skippedUnverified };
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

    if (created.kind === 'created') this.metrics.recordLeadCreated();
    return { leadCreated: created.kind === 'created', verified: status.verified };
  }

  /** Notifie le voyageur de l'issue (017). No-op si le notifier n'est pas câblé.
   *  Le notifier est best-effort (il ne throw jamais), mais on garde la garde. */
  private async notifyVoyageur(
    briefId: string,
    outcome: MatchOutcome,
    conseillerIds: ReadonlyArray<string>,
    idempotencyKey: string,
  ): Promise<void> {
    await this.deps.voyageurNotifier?.onBriefOutcome({
      briefId,
      outcome,
      conseillerIds,
      idempotencyKey,
    });
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
