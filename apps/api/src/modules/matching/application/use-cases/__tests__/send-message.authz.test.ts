// T027 [US3] — Durcissement autorisation d'envoi : re-filtrage `verified`
// DYNAMIQUE (conseiller révoqué → écriture refusée) et statut d'écriture dérivé
// du lead (refusé/perdu → lecture seule). Complète send-message.use-case.test.ts.

import type { LeadState } from '@cv/shared/matching';
import { describe, expect, it } from 'vitest';
import {
  FakeConversationNotificationOutbox,
  FakeConversationRepo,
} from '../../__tests__/_conversation-fakes';
import {
  FakeClock,
  FakeConformiteQuery,
  FakeLeadReader,
  FakeLeadWriter,
  FakeUuidGenerator,
  LeadFakeStore,
} from '../../__tests__/_lead-fakes';
import { SendMessageUseCase } from '../send-message.use-case';

const LEAD = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const MR = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const CONS = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const BRIEF = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const CONV = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const VOY = 'voy-ref-1';

async function seed(opts: { leadState: LeadState; verified: boolean }) {
  const store = new LeadFakeStore();
  const writer = new FakeLeadWriter(store);
  await writer.createLead({
    id: LEAD,
    matchingResultId: MR,
    matchingResultEntryPosition: 1,
    conseillerId: CONS,
    briefId: BRIEF,
    scoreFinal: 0.8,
    boosted: false,
    createdAt: new Date('2026-06-05T10:00:00Z'),
  });
  const lead = store.leads.find((l) => l.id === LEAD);
  if (lead) lead.currentState = opts.leadState;

  const repo = new FakeConversationRepo();
  await repo.createConversation({
    id: CONV,
    leadId: LEAD,
    conseillerId: CONS,
    briefId: BRIEF,
    voyageurRef: VOY,
    openedAt: new Date('2026-06-07T11:00:00Z'),
  });
  const uc = new SendMessageUseCase({
    clock: new FakeClock(new Date('2026-06-07T12:00:00Z')),
    uuid: new FakeUuidGenerator(),
    repo,
    outbox: new FakeConversationNotificationOutbox(),
    leadReader: new FakeLeadReader(store),
    conformiteQuery: new FakeConformiteQuery(opts.verified ? [CONS] : []),
  });
  return { uc };
}

describe('SendMessage — autorisation durcie (US3)', () => {
  it('conseiller révoqué (verified=false) → écriture refusée [FR-008]', async () => {
    const { uc } = await seed({ leadState: 'accepte', verified: false });
    const r = await uc.execute({
      conversationId: CONV,
      sender: 'conseiller',
      senderRef: CONS,
      body: 'Bonjour',
      idempotencyKey: 'k1',
    });
    expect(r.kind).toBe('forbidden_unverified');
  });

  it('lead refusé → lecture seule [SC-004]', async () => {
    const { uc } = await seed({ leadState: 'refuse', verified: true });
    const r = await uc.execute({
      conversationId: CONV,
      sender: 'conseiller',
      senderRef: CONS,
      body: 'Encore disponible ?',
      idempotencyKey: 'k2',
    });
    expect(r.kind).toBe('read_only');
  });

  it('lead perdu → lecture seule [SC-004]', async () => {
    const { uc } = await seed({ leadState: 'perdu', verified: true });
    const r = await uc.execute({
      conversationId: CONV,
      sender: 'voyageur',
      senderRef: VOY,
      body: 'Merci',
      idempotencyKey: 'k3',
    });
    expect(r.kind).toBe('read_only');
  });

  it('lead devis_envoyé + vérifié → écriture permise', async () => {
    const { uc } = await seed({ leadState: 'devis_envoye', verified: true });
    const r = await uc.execute({
      conversationId: CONV,
      sender: 'conseiller',
      senderRef: CONS,
      body: 'Voici la version révisée.',
      idempotencyKey: 'k4',
    });
    expect(r.kind).toBe('sent');
  });
});
