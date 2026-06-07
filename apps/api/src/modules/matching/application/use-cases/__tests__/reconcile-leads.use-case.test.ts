// T045 — ReconcileLeadsUseCase (US3 sweep, mode dégradé bus HS).
// Un MR actif sans lead → recrée leads + notifications ; rejouable idempotent.

import { asMatchingResultId } from '@cv/shared/matching';
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
import type {
  MatchingResultEntity,
  MatchingResultReader,
} from '../../ports/matching-result-reader.port';
import { ConsumeMatchingEventUseCase } from '../consume-matching-event.use-case';
import { ReconcileLeadsUseCase } from '../reconcile-leads.use-case';

const MR_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const BRIEF_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const C1 = 'c1111111-1111-4111-8111-111111111111';
const C2 = 'c2222222-2222-4222-8222-222222222222';

function fakeMatchingResultReader(entity: MatchingResultEntity | null): MatchingResultReader {
  return {
    async findActiveByBriefId(briefId) {
      return entity && entity.briefId === briefId ? entity : null;
    },
    async findActiveOkResultsForRevocationScan() {
      return [];
    },
  };
}

function buildMr(): MatchingResultEntity {
  return {
    id: asMatchingResultId(MR_ID),
    briefId: BRIEF_ID,
    status: 'partial',
    matchedCount: 2,
    algorithmVersion: 'v1.0',
    suggestedConseillerId: null,
    boostApplied: false,
    computedAt: new Date('2026-06-05T11:00:00Z'),
    supersededAt: null,
    supersededByMatchingResultId: null,
    entries: [
      {
        position: 1,
        conseillerId: C1,
        scoreBrut: 0.9,
        scoreFinal: 0.9,
        scoreComponents: { destination: 1, geo: 1, speciality: 1, familiarity: 1 },
        boosted: false,
      },
      {
        position: 2,
        conseillerId: C2,
        scoreBrut: 0.8,
        scoreFinal: 0.8,
        scoreComponents: { destination: 1, geo: 1, speciality: 1, familiarity: 1 },
        boosted: false,
      },
    ],
  };
}

function build(mr: MatchingResultEntity | null) {
  const store = new LeadFakeStore();
  const consume = new ConsumeMatchingEventUseCase({
    clock: new FakeClock(new Date('2026-06-05T12:00:00Z')),
    uuid: new FakeUuidGenerator(),
    consumedEvents: new FakeConsumedEventStore(store),
    leadWriter: new FakeLeadWriter(store),
    notificationOutbox: new FakeLeadNotificationOutbox(store),
    conformiteQuery: new FakeConformiteQuery([C1, C2]),
  });
  const uc = new ReconcileLeadsUseCase({
    leadReader: new FakeLeadReader(store),
    matchingResultReader: fakeMatchingResultReader(mr),
    consume,
  });
  return { store, uc };
}

describe('ReconcileLeadsUseCase — US3 sweep', () => {
  it('MR actif sans lead → recrée leads + notifications', async () => {
    const { store, uc } = build(buildMr());
    store.activeMatchingResultsWithoutLead = [{ matchingResultId: MR_ID, briefId: BRIEF_ID }];
    const res = await uc.execute({ limit: 100 });
    expect(res).toEqual({ scanned: 1, recreated: 2 });
    expect(store.leads).toHaveLength(2);
    expect(store.notifications.filter((n) => n.status === 'pending')).toHaveLength(2);
  });

  it('rejeu idempotent : un 2e sweep ne recrée pas de lead', async () => {
    const { store, uc } = build(buildMr());
    store.activeMatchingResultsWithoutLead = [{ matchingResultId: MR_ID, briefId: BRIEF_ID }];
    await uc.execute({ limit: 100 });
    // L'orphelin reste listé (le fake ne se met pas à jour) → re-sweep.
    const res = await uc.execute({ limit: 100 });
    expect(res.recreated).toBe(0); // createLead → duplicate, aucun nouveau
    expect(store.leads).toHaveLength(2);
  });

  it('aucun orphelin → rien à faire', async () => {
    const { uc } = build(buildMr());
    const res = await uc.execute({ limit: 100 });
    expect(res).toEqual({ scanned: 0, recreated: 0 });
  });
});
