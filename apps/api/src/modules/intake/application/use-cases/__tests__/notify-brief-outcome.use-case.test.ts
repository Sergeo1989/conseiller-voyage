// T013 [017 US1] — Tests NotifyBriefOutcomeUseCase (notifier public).
// Idempotence + anti-spam + best-effort (ne throw jamais). Pas de DB (fakes).

import type { MatchOutcome } from '@cv/shared/intake';
import { describe, expect, it } from 'vitest';
import type { Clock } from '../../../../../common/ports/clock.port';
import type { UuidGenerator } from '../../../../../common/ports/uuid-generator.port';
import type {
  EnqueueVoyageurNotificationInput,
  EnqueueVoyageurNotificationResult,
  VoyageurNotificationOutbox,
} from '../../ports';
import { NotifyBriefOutcomeUseCase } from '../notify-brief-outcome.use-case';

const NOW = new Date('2026-06-16T12:00:00Z');
const clock: Clock = { now: () => NOW, nowMs: () => NOW.getTime() };
let counter = 0;
const uuid: UuidGenerator = { generate: () => `id-${++counter}` };

class FakeOutbox implements VoyageurNotificationOutbox {
  readonly enqueued: EnqueueVoyageurNotificationInput[] = [];
  private last = new Map<string, MatchOutcome>();
  constructor(private readonly throwOnEnqueue = false) {}

  enqueue(input: EnqueueVoyageurNotificationInput): Promise<EnqueueVoyageurNotificationResult> {
    if (this.throwOnEnqueue) return Promise.reject(new Error('db down'));
    if (this.enqueued.some((e) => e.idempotencyKey === input.idempotencyKey)) {
      return Promise.resolve({ kind: 'duplicate' });
    }
    this.enqueued.push(input);
    if (input.outcome) this.last.set(input.briefId, input.outcome);
    return Promise.resolve({ kind: 'enqueued' });
  }
  lastOutcomeForBrief(briefId: string): Promise<MatchOutcome | null> {
    return Promise.resolve(this.last.get(briefId) ?? null);
  }
  scanPending(): Promise<never[]> {
    return Promise.resolve([]);
  }
  markSent(): Promise<void> {
    return Promise.resolve();
  }
  markFailed(): Promise<void> {
    return Promise.resolve();
  }
  cancelPendingForBrief(): Promise<void> {
    return Promise.resolve();
  }
}

const uc = (outbox: VoyageurNotificationOutbox) =>
  new NotifyBriefOutcomeUseCase({ clock, uuid, outbox });

describe('NotifyBriefOutcomeUseCase', () => {
  it('matché → enqueue une notification conseillers_prets', async () => {
    const outbox = new FakeOutbox();
    await uc(outbox).onBriefOutcome({
      briefId: 'b1',
      outcome: 'matched',
      conseillerIds: ['c1', 'c2'],
      idempotencyKey: 'evt-1',
    });
    expect(outbox.enqueued).toHaveLength(1);
    expect(outbox.enqueued[0]?.type).toBe('conseillers_prets');
  });

  it('non matché → recherche_en_cours', async () => {
    const outbox = new FakeOutbox();
    await uc(outbox).onBriefOutcome({
      briefId: 'b1',
      outcome: 'unmatched',
      conseillerIds: [],
      idempotencyKey: 'evt-1',
    });
    expect(outbox.enqueued[0]?.type).toBe('recherche_en_cours');
  });

  it('issue inchangée → anti-spam (pas de 2e enqueue)', async () => {
    const outbox = new FakeOutbox();
    const u = uc(outbox);
    await u.onBriefOutcome({
      briefId: 'b1',
      outcome: 'matched',
      conseillerIds: ['c1'],
      idempotencyKey: 'evt-1',
    });
    await u.onBriefOutcome({
      briefId: 'b1',
      outcome: 'matched',
      conseillerIds: ['c1'],
      idempotencyKey: 'evt-2',
    });
    expect(outbox.enqueued).toHaveLength(1);
  });

  it('changement d’issue (unmatched → matched) → 2 notifications', async () => {
    const outbox = new FakeOutbox();
    const u = uc(outbox);
    await u.onBriefOutcome({
      briefId: 'b1',
      outcome: 'unmatched',
      conseillerIds: [],
      idempotencyKey: 'e1',
    });
    await u.onBriefOutcome({
      briefId: 'b1',
      outcome: 'matched',
      conseillerIds: ['c1'],
      idempotencyKey: 'e2',
    });
    expect(outbox.enqueued.map((e) => e.type)).toEqual(['recherche_en_cours', 'conseillers_prets']);
  });

  it('échec d’enqueue → ne throw jamais (best-effort, Principe X)', async () => {
    const outbox = new FakeOutbox(true);
    await expect(
      uc(outbox).onBriefOutcome({
        briefId: 'b1',
        outcome: 'matched',
        conseillerIds: ['c1'],
        idempotencyKey: 'e1',
      }),
    ).resolves.toBeUndefined();
  });
});
