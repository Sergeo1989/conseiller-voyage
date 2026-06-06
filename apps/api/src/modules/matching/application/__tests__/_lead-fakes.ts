// T023 — Fakes en mémoire pour les use cases leads (feature 012).
// 5 ports leads + ConformiteQueryPort + Clock + UuidGenerator.

import type { ConformiteQueryPort, VerificationStatusDto } from '@cv/shared/conformite';
import type { LeadAction, LeadState, LeadTransitionActor } from '@cv/shared/matching';
import { isTerminalLeadState } from '@cv/shared/matching';
import type { Clock } from '../../../../common/ports/clock.port';
import type { UuidGenerator } from '../../../../common/ports/uuid-generator.port';
import type {
  AppendTransitionInput,
  AppendTransitionResult,
  CloseLeadsSystemInput,
  ConsumedEventStore,
  CreateLeadInput,
  CreateLeadResult,
  EnqueueNotificationInput,
  EnqueueNotificationResult,
  LeadNotificationOutboxPort,
  LeadReader,
  LeadRecord,
  LeadWithHistory,
  LeadWriter,
  ListLeadsByConseillerFilter,
  ListLeadsByConseillerResult,
  MatchingResultWithoutLead,
  PendingNotification,
} from '../ports';

// ---------------------------------------------------------------------------
// Store partagé (writer + reader + outbox cohérents)
// ---------------------------------------------------------------------------

export interface StoredLead {
  id: string;
  matchingResultId: string;
  matchingResultEntryPosition: 1 | 2 | 3;
  conseillerId: string;
  briefId: string | null;
  currentState: LeadState;
  scoreFinal: number | null;
  boosted: boolean;
  closeReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface StoredTransition {
  id: string;
  leadId: string;
  fromState: LeadState | null;
  toState: LeadState;
  action: LeadAction;
  actor: LeadTransitionActor;
  actorId: string | null;
  reason: string | null;
  occurredAt: Date;
}

export interface StoredNotification {
  id: string;
  leadId: string;
  conseillerId: string;
  idempotencyKey: string;
  status: 'pending' | 'sent' | 'failed' | 'skipped_unverified';
  attempts: number;
  lastError: string | null;
  createdAt: Date;
  sentAt: Date | null;
}

export class LeadFakeStore {
  leads: StoredLead[] = [];
  transitions: StoredTransition[] = [];
  notifications: StoredNotification[] = [];
  consumed = new Map<string, string>();
  /** MatchingResults actifs sans lead (alimente le sweep — scénarios US3). */
  activeMatchingResultsWithoutLead: MatchingResultWithoutLead[] = [];

  findLead(conseillerId: string, matchingResultId: string): StoredLead | undefined {
    return this.leads.find(
      (l) => l.conseillerId === conseillerId && l.matchingResultId === matchingResultId,
    );
  }
}

// ---------------------------------------------------------------------------
// Clock + UuidGenerator déterministes
// ---------------------------------------------------------------------------

export class FakeClock implements Clock {
  constructor(private current: Date) {}
  now(): Date {
    return this.current;
  }
  nowMs(): number {
    return this.current.getTime();
  }
  set(date: Date): void {
    this.current = date;
  }
}

export class FakeUuidGenerator implements UuidGenerator {
  private counter = 0;
  constructor(private readonly prefix = '00000000-0000-4000-8000-') {}
  generate(): string {
    this.counter += 1;
    return this.prefix + this.counter.toString(16).padStart(12, '0');
  }
}

// ---------------------------------------------------------------------------
// Fakes ports leads
// ---------------------------------------------------------------------------

export class FakeConsumedEventStore implements ConsumedEventStore {
  constructor(private readonly store: LeadFakeStore) {}
  async hasConsumed(key: string): Promise<boolean> {
    return this.store.consumed.has(key);
  }
  async recordConsumed(key: string, eventName: string): Promise<boolean> {
    if (this.store.consumed.has(key)) return false;
    this.store.consumed.set(key, eventName);
    return true;
  }
}

export class FakeLeadWriter implements LeadWriter {
  constructor(private readonly store: LeadFakeStore) {}

  async createLead(input: CreateLeadInput): Promise<CreateLeadResult> {
    const existing = this.store.findLead(input.conseillerId, input.matchingResultId);
    if (existing) return { kind: 'duplicate', leadId: existing.id };
    this.store.leads.push({
      id: input.id,
      matchingResultId: input.matchingResultId,
      matchingResultEntryPosition: input.matchingResultEntryPosition,
      conseillerId: input.conseillerId,
      briefId: input.briefId,
      currentState: 'envoye',
      scoreFinal: input.scoreFinal,
      boosted: input.boosted,
      closeReason: null,
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
    });
    return { kind: 'created', leadId: input.id };
  }

  async appendTransition(input: AppendTransitionInput): Promise<AppendTransitionResult> {
    const lead = this.store.leads.find((l) => l.id === input.leadId);
    if (!lead) return { kind: 'conflict' };
    // Guard de concurrence optimiste.
    if (lead.currentState !== input.expectedState) return { kind: 'conflict' };
    this.store.transitions.push({
      id: input.transitionId,
      leadId: input.leadId,
      fromState: input.fromState,
      toState: input.toState,
      action: input.action,
      actor: input.actor,
      actorId: input.actorId,
      reason: input.reason,
      occurredAt: input.occurredAt,
    });
    lead.currentState = input.toState;
    lead.updatedAt = input.occurredAt;
    if (input.closeReason) lead.closeReason = input.closeReason;
    return { kind: 'applied' };
  }

  async closeLeadsSystem(input: CloseLeadsSystemInput): Promise<number> {
    let count = 0;
    for (const lead of this.store.leads) {
      if (lead.matchingResultId !== input.matchingResultId) continue;
      if (isTerminalLeadState(lead.currentState)) continue;
      this.store.transitions.push({
        id: `close-${lead.id}`,
        leadId: lead.id,
        fromState: lead.currentState,
        toState: 'perdu',
        action: 'clore_systeme',
        actor: 'systeme',
        actorId: null,
        reason: input.reason,
        occurredAt: input.occurredAt,
      });
      lead.currentState = 'perdu';
      lead.closeReason = input.reason;
      lead.updatedAt = input.occurredAt;
      count += 1;
    }
    return count;
  }
}

function toRecord(l: StoredLead): LeadRecord {
  return {
    id: l.id,
    matchingResultId: l.matchingResultId,
    matchingResultEntryPosition: l.matchingResultEntryPosition,
    conseillerId: l.conseillerId,
    briefId: l.briefId,
    currentState: l.currentState,
    scoreFinal: l.scoreFinal,
    boosted: l.boosted,
    closeReason: l.closeReason,
    createdAt: l.createdAt,
    updatedAt: l.updatedAt,
  };
}

export class FakeLeadReader implements LeadReader {
  constructor(private readonly store: LeadFakeStore) {}

  async findById(leadId: string): Promise<LeadWithHistory | null> {
    const l = this.store.leads.find((x) => x.id === leadId);
    if (!l) return null;
    return {
      ...toRecord(l),
      history: this.store.transitions
        .filter((t) => t.leadId === leadId)
        .sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime())
        .map((t) => ({
          id: t.id,
          fromState: t.fromState,
          toState: t.toState,
          actor: t.actor,
          actorId: t.actorId,
          occurredAt: t.occurredAt,
        })),
    };
  }

  async listByConseiller(
    filter: ListLeadsByConseillerFilter,
  ): Promise<ListLeadsByConseillerResult> {
    let items = this.store.leads.filter((l) => l.conseillerId === filter.conseillerId);
    if (filter.state) items = items.filter((l) => l.currentState === filter.state);
    const total = items.length;
    const start = (filter.page - 1) * filter.pageSize;
    const page = items.slice(start, start + filter.pageSize);
    const withHistory = await Promise.all(page.map((l) => this.findById(l.id)));
    return { items: withHistory.filter((x): x is LeadWithHistory => x !== null), total };
  }

  async findActiveByBriefAndConseiller(
    briefId: string,
    conseillerId: string,
  ): Promise<LeadRecord | null> {
    const l = this.store.leads.find(
      (x) =>
        x.briefId === briefId &&
        x.conseillerId === conseillerId &&
        !isTerminalLeadState(x.currentState),
    );
    return l ? toRecord(l) : null;
  }

  async findActiveMatchingResultsWithoutLead(
    limit: number,
  ): Promise<ReadonlyArray<MatchingResultWithoutLead>> {
    return this.store.activeMatchingResultsWithoutLead.slice(0, limit);
  }
}

export class FakeLeadNotificationOutbox implements LeadNotificationOutboxPort {
  constructor(private readonly store: LeadFakeStore) {}

  async enqueue(input: EnqueueNotificationInput): Promise<EnqueueNotificationResult> {
    if (this.store.notifications.some((n) => n.idempotencyKey === input.idempotencyKey)) {
      return { kind: 'duplicate' };
    }
    this.store.notifications.push({
      id: input.id,
      leadId: input.leadId,
      conseillerId: input.conseillerId,
      idempotencyKey: input.idempotencyKey,
      status: input.status,
      attempts: 0,
      lastError: null,
      createdAt: input.createdAt,
      sentAt: null,
    });
    return { kind: 'enqueued' };
  }

  async scanPending(limit: number): Promise<ReadonlyArray<PendingNotification>> {
    return this.store.notifications
      .filter((n) => n.status === 'pending')
      .slice(0, limit)
      .map((n) => ({
        id: n.id,
        leadId: n.leadId,
        conseillerId: n.conseillerId,
        idempotencyKey: n.idempotencyKey,
        attempts: n.attempts,
      }));
  }

  async markSent(id: string, sentAt: Date): Promise<void> {
    const n = this.store.notifications.find((x) => x.id === id);
    if (n) {
      n.status = 'sent';
      n.sentAt = sentAt;
    }
  }

  async markFailed(id: string, error: string): Promise<void> {
    const n = this.store.notifications.find((x) => x.id === id);
    if (n) {
      n.status = 'failed';
      n.attempts += 1;
      n.lastError = error;
    }
  }

  async markSkippedUnverified(id: string): Promise<void> {
    const n = this.store.notifications.find((x) => x.id === id);
    if (n) n.status = 'skipped_unverified';
  }
}

// ---------------------------------------------------------------------------
// Fake ConformiteQueryPort — Map conseillerId → verified
// ---------------------------------------------------------------------------

export class FakeConformiteQuery implements ConformiteQueryPort {
  private readonly statuses = new Map<string, boolean>();
  constructor(verified: ReadonlyArray<string> = []) {
    for (const id of verified) this.statuses.set(id, true);
  }
  setVerified(conseillerId: string, verified: boolean): void {
    this.statuses.set(conseillerId, verified);
  }
  async getVerificationStatus(args: { conseillerId: string }): Promise<VerificationStatusDto> {
    return {
      conseillerId: args.conseillerId,
      verified: this.statuses.get(args.conseillerId) ?? false,
      lastVerifiedAt: null,
    };
  }
  onStatusChanged(): () => void {
    return () => {};
  }
}
