// T036 [TDD RED] — RecordLeadTransitionUseCase (US2).
// Autorisation propriétaire + re-check verified (FR-008) + concurrence
// optimiste (FR-020) + machine d'état (transition invalide rejetée).

import { describe, expect, it } from 'vitest';
import {
  FakeClock,
  FakeConformiteQuery,
  FakeLeadReader,
  FakeLeadWriter,
  FakeUuidGenerator,
  LeadFakeStore,
} from '../../__tests__/_lead-fakes';
import { RecordLeadTransitionUseCase } from '../record-lead-transition.use-case';

const LEAD_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const MR_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const OWNER = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const OTHER = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

async function seedLead(store: LeadFakeStore, currentState: string) {
  const writer = new FakeLeadWriter(store);
  await writer.createLead({
    id: LEAD_ID,
    matchingResultId: MR_ID,
    matchingResultEntryPosition: 1,
    conseillerId: OWNER,
    briefId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    scoreFinal: 0.8,
    boosted: false,
    createdAt: new Date('2026-06-05T10:00:00Z'),
  });
  const lead = store.leads.find((l) => l.id === LEAD_ID);
  if (lead) lead.currentState = currentState as never;
}

function build(verified: string[]) {
  const store = new LeadFakeStore();
  const uc = new RecordLeadTransitionUseCase({
    clock: new FakeClock(new Date('2026-06-05T12:00:00Z')),
    uuid: new FakeUuidGenerator(),
    leadReader: new FakeLeadReader(store),
    leadWriter: new FakeLeadWriter(store),
    conformiteQuery: new FakeConformiteQuery(verified),
  });
  return { store, uc };
}

describe('RecordLeadTransitionUseCase — US2', () => {
  it('vu + accepter (propriétaire vérifié) → applied accepte', async () => {
    const { store, uc } = build([OWNER]);
    await seedLead(store, 'vu');
    const res = await uc.execute({ leadId: LEAD_ID, conseillerId: OWNER, action: 'accepter' });
    expect(res).toEqual({ kind: 'applied', newState: 'accepte' });
    expect(store.transitions).toHaveLength(1);
    expect(store.leads[0]?.currentState).toBe('accepte');
  });

  it('transition invalide (envoye + accepter) → invalid_transition', async () => {
    const { store, uc } = build([OWNER]);
    await seedLead(store, 'envoye');
    const res = await uc.execute({ leadId: LEAD_ID, conseillerId: OWNER, action: 'accepter' });
    expect(res.kind).toBe('invalid_transition');
    expect(store.transitions).toHaveLength(0);
  });

  it('lead inexistant → not_found', async () => {
    const { uc } = build([OWNER]);
    const res = await uc.execute({ leadId: LEAD_ID, conseillerId: OWNER, action: 'accepter' });
    expect(res.kind).toBe('not_found');
  });

  it('non propriétaire → forbidden_not_owner', async () => {
    const { store, uc } = build([OWNER, OTHER]);
    await seedLead(store, 'vu');
    const res = await uc.execute({ leadId: LEAD_ID, conseillerId: OTHER, action: 'accepter' });
    expect(res.kind).toBe('forbidden_not_owner');
  });

  it('conseiller non vérifié → forbidden_unverified (aucune transition)', async () => {
    const { store, uc } = build([]); // OWNER non vérifié
    await seedLead(store, 'vu');
    const res = await uc.execute({ leadId: LEAD_ID, conseillerId: OWNER, action: 'accepter' });
    expect(res.kind).toBe('forbidden_unverified');
    expect(store.transitions).toHaveLength(0);
  });

  it('concurrence optimiste : état devenu obsolète → conflict', async () => {
    const { store, uc } = build([OWNER]);
    await seedLead(store, 'vu');
    // Simule une transition concurrente : l'état réel est déjà accepte.
    const concurrent = store.leads[0];
    if (concurrent) concurrent.currentState = 'accepte';
    // L'appelant croit être à vu → guard WHERE currentState = vu échoue.
    const res = await uc.execute({
      leadId: LEAD_ID,
      conseillerId: OWNER,
      action: 'accepter',
      expectedState: 'vu',
    });
    expect(res.kind).toBe('conflict');
  });

  it('marquer_perdu avec reason → applied perdu, reason persistée', async () => {
    const { store, uc } = build([OWNER]);
    await seedLead(store, 'vu');
    const res = await uc.execute({
      leadId: LEAD_ID,
      conseillerId: OWNER,
      action: 'marquer_perdu',
      reason: 'voyageur injoignable',
    });
    expect(res).toEqual({ kind: 'applied', newState: 'perdu' });
    expect(store.transitions[0]?.reason).toBe('voyageur injoignable');
  });
});
