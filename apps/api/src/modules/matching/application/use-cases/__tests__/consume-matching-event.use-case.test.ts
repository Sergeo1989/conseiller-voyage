// T022 [TDD RED] — ConsumeMatchingEventUseCase (US1 P1 MVP).
//
// matched 3 vérifiés → 3 leads + 3 notifications pending ;
// partial → 2 ; unmatched → 0 + trace ; replay même idempotencyKey → no-op ;
// conseiller non vérifié → notification skipped_unverified (pas de pending).

import { describe, expect, it } from 'vitest';
import {
  FakeClock,
  FakeConformiteQuery,
  FakeConsumedEventStore,
  FakeLeadNotificationOutbox,
  FakeLeadReader,
  FakeLeadWriter,
  FakeUuidGenerator,
  LeadFakeStore,
} from '../../__tests__/_lead-fakes';
import { ConsumeMatchingEventUseCase } from '../consume-matching-event.use-case';

const MR_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const BRIEF_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const C1 = 'c1111111-1111-4111-8111-111111111111';
const C2 = 'c2222222-2222-4222-8222-222222222222';
const C3 = 'c3333333-3333-4333-8333-333333333333';

function build(verified: string[]) {
  const store = new LeadFakeStore();
  const uc = new ConsumeMatchingEventUseCase({
    clock: new FakeClock(new Date('2026-06-05T12:00:00Z')),
    uuid: new FakeUuidGenerator(),
    consumedEvents: new FakeConsumedEventStore(store),
    leadWriter: new FakeLeadWriter(store),
    notificationOutbox: new FakeLeadNotificationOutbox(store),
    conformiteQuery: new FakeConformiteQuery(verified),
  });
  return { store, uc, reader: new FakeLeadReader(store) };
}

function matchedEvent(idempotencyKey = 'evt-matched-1') {
  return {
    name: 'voyageur.brief.matched' as const,
    idempotencyKey,
    payload: {
      matchingResultId: MR_ID,
      briefId: BRIEF_ID,
      matchedCount: 3,
      algorithmVersion: 'v1.0',
      computedAt: '2026-06-05T11:59:00.000Z',
      entries: [
        { position: 1, conseillerId: C1, scoreFinal: 0.9, boosted: false },
        { position: 2, conseillerId: C2, scoreFinal: 0.8, boosted: false },
        { position: 3, conseillerId: C3, scoreFinal: 0.7, boosted: false },
      ],
      boostApplied: false,
    },
  };
}

describe('ConsumeMatchingEventUseCase — US1', () => {
  it('matched 3 vérifiés → 3 leads + 3 notifications pending', async () => {
    const { store, uc } = build([C1, C2, C3]);
    const res = await uc.execute(matchedEvent());
    expect(res).toEqual({
      kind: 'processed',
      leadsCreated: 3,
      notificationsPending: 3,
      skippedUnverified: 0,
    });
    expect(store.leads).toHaveLength(3);
    expect(store.notifications.filter((n) => n.status === 'pending')).toHaveLength(3);
    // Idempotency key par (conseiller × MR).
    expect(store.notifications.map((n) => n.idempotencyKey).sort()).toEqual([
      `lead:${C1}:${MR_ID}`,
      `lead:${C2}:${MR_ID}`,
      `lead:${C3}:${MR_ID}`,
    ]);
    // Tous à l'état initial envoye.
    expect(store.leads.every((l) => l.currentState === 'envoye')).toBe(true);
  });

  it('replay du même idempotencyKey → no-op (duplicate)', async () => {
    const { store, uc } = build([C1, C2, C3]);
    await uc.execute(matchedEvent());
    const res = await uc.execute(matchedEvent());
    expect(res).toEqual({ kind: 'duplicate' });
    expect(store.leads).toHaveLength(3);
    expect(store.notifications).toHaveLength(3);
  });

  it('partially_matched (2 entries) → 2 leads + 2 notifications', async () => {
    const { store, uc } = build([C1, C2]);
    const res = await uc.execute({
      name: 'voyageur.brief.partially_matched',
      idempotencyKey: 'evt-partial-1',
      payload: {
        matchingResultId: MR_ID,
        briefId: BRIEF_ID,
        matchedCount: 2,
        algorithmVersion: 'v1.0',
        computedAt: '2026-06-05T11:59:00.000Z',
        entries: [
          { position: 1, conseillerId: C1, scoreFinal: 0.9, boosted: false },
          { position: 2, conseillerId: C2, scoreFinal: 0.8, boosted: false },
        ],
        boostApplied: false,
        reason: 'insufficient_verified_conseillers',
      },
    });
    expect(res.kind).toBe('processed');
    expect(store.leads).toHaveLength(2);
    expect(store.notifications.filter((n) => n.status === 'pending')).toHaveLength(2);
  });

  it('unmatched → 0 lead, 0 notification, trace consommée', async () => {
    const { store, uc } = build([]);
    const res = await uc.execute({
      name: 'voyageur.brief.unmatched',
      idempotencyKey: 'evt-unmatched-1',
      payload: {
        matchingResultId: MR_ID,
        briefId: BRIEF_ID,
        matchedCount: 0,
        algorithmVersion: 'v1.0',
        computedAt: '2026-06-05T11:59:00.000Z',
        reason: 'no_verified_conseillers_at_all',
        candidatesEvaluatedCount: 5,
      },
    });
    expect(res).toEqual({ kind: 'unmatched' });
    expect(store.leads).toHaveLength(0);
    expect(store.notifications).toHaveLength(0);
    expect(store.consumed.has('evt-unmatched-1')).toBe(true);
  });

  it('conseiller non vérifié → skipped_unverified, les autres notifiés', async () => {
    const { store, uc } = build([C1, C3]); // C2 non vérifié
    const res = await uc.execute(matchedEvent());
    expect(res).toEqual({
      kind: 'processed',
      leadsCreated: 3,
      notificationsPending: 2,
      skippedUnverified: 1,
    });
    const c2Notif = store.notifications.find((n) => n.conseillerId === C2);
    expect(c2Notif?.status).toBe('skipped_unverified');
    expect(store.notifications.filter((n) => n.status === 'pending')).toHaveLength(2);
  });
});
