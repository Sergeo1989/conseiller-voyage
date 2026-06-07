// T038 [TDD RED] — ViewLeadUseCase (US2, FR-019).
// Auto envoye→vu à la 1re consultation (idempotent : 2e lecture sans nouvelle
// transition). Autorisation propriétaire.

import { describe, expect, it } from 'vitest';
import {
  FakeClock,
  FakeLeadReader,
  FakeLeadWriter,
  FakeUuidGenerator,
  LeadFakeStore,
} from '../../__tests__/_lead-fakes';
import { ViewLeadUseCase } from '../view-lead.use-case';

const LEAD_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OWNER = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const OTHER = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

async function seed(store: LeadFakeStore) {
  await new FakeLeadWriter(store).createLead({
    id: LEAD_ID,
    matchingResultId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    matchingResultEntryPosition: 1,
    conseillerId: OWNER,
    briefId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    scoreFinal: 0.8,
    boosted: false,
    createdAt: new Date('2026-06-05T10:00:00Z'),
  });
}

function build() {
  const store = new LeadFakeStore();
  const uc = new ViewLeadUseCase({
    clock: new FakeClock(new Date('2026-06-05T12:00:00Z')),
    uuid: new FakeUuidGenerator(),
    leadReader: new FakeLeadReader(store),
    leadWriter: new FakeLeadWriter(store),
  });
  return { store, uc };
}

describe('ViewLeadUseCase — US2', () => {
  it('1re consultation : envoye → vu + 1 transition', async () => {
    const { store, uc } = build();
    await seed(store);
    const res = await uc.execute({ leadId: LEAD_ID, conseillerId: OWNER });
    expect(res.kind).toBe('ok');
    if (res.kind === 'ok') expect(res.lead.currentState).toBe('vu');
    expect(store.transitions).toHaveLength(1);
    expect(store.transitions[0]?.toState).toBe('vu');
  });

  it('2e consultation : idempotent (aucune nouvelle transition)', async () => {
    const { store, uc } = build();
    await seed(store);
    await uc.execute({ leadId: LEAD_ID, conseillerId: OWNER });
    await uc.execute({ leadId: LEAD_ID, conseillerId: OWNER });
    expect(store.transitions).toHaveLength(1);
    expect(store.leads[0]?.currentState).toBe('vu');
  });

  it('lead inexistant → not_found', async () => {
    const { uc } = build();
    const res = await uc.execute({ leadId: LEAD_ID, conseillerId: OWNER });
    expect(res.kind).toBe('not_found');
  });

  it('non propriétaire → forbidden_not_owner (pas de transition)', async () => {
    const { store, uc } = build();
    await seed(store);
    const res = await uc.execute({ leadId: LEAD_ID, conseillerId: OTHER });
    expect(res.kind).toBe('forbidden_not_owner');
    expect(store.transitions).toHaveLength(0);
  });
});
