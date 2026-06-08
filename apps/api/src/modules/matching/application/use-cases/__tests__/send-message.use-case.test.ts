// T009 [US1] [TDD RED] — SendMessage : autorisation membre, canWrite (lead +
// vérifié), validation, idempotence, 1 notif/destinataire.

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
  const outbox = new FakeConversationNotificationOutbox();
  const uc = new SendMessageUseCase({
    clock: new FakeClock(new Date('2026-06-07T12:00:00Z')),
    uuid: new FakeUuidGenerator(),
    repo,
    outbox,
    leadReader: new FakeLeadReader(store),
    conformiteQuery: new FakeConformiteQuery(opts.verified ? [CONS] : []),
  });
  return { repo, outbox, uc };
}

describe('SendMessage (US1)', () => {
  it('conseiller membre + lead accepté + vérifié → envoyé, 1 notif vers le voyageur', async () => {
    const { outbox, uc } = await seed({ leadState: 'accepte', verified: true });
    const r = await uc.execute({
      conversationId: CONV,
      sender: 'conseiller',
      senderRef: CONS,
      body: 'Bonjour, voici mon devis.',
      idempotencyKey: 'k1',
    });
    expect(r.kind).toBe('sent');
    expect(outbox.entries).toHaveLength(1);
    expect(outbox.entries[0]?.recipient).toBe('voyageur');
  });

  it('voyageur membre → envoyé, 1 notif vers le conseiller', async () => {
    const { outbox, uc } = await seed({ leadState: 'accepte', verified: true });
    const r = await uc.execute({
      conversationId: CONV,
      sender: 'voyageur',
      senderRef: VOY,
      body: 'Merci !',
      idempotencyKey: 'k2',
    });
    expect(r.kind).toBe('sent');
    expect(outbox.entries[0]?.recipient).toBe('conseiller');
  });

  it('idempotent : même clé → pas de doublon (message + notif)', async () => {
    const { repo, outbox, uc } = await seed({ leadState: 'accepte', verified: true });
    await uc.execute({
      conversationId: CONV,
      sender: 'conseiller',
      senderRef: CONS,
      body: 'Hello',
      idempotencyKey: 'kx',
    });
    const r2 = await uc.execute({
      conversationId: CONV,
      sender: 'conseiller',
      senderRef: CONS,
      body: 'Hello',
      idempotencyKey: 'kx',
    });
    expect(r2.kind).toBe('duplicate');
    expect(repo.messages).toHaveLength(1);
    expect(outbox.entries).toHaveLength(1);
  });

  it('non-membre → refus', async () => {
    const { uc } = await seed({ leadState: 'accepte', verified: true });
    const r = await uc.execute({
      conversationId: CONV,
      sender: 'voyageur',
      senderRef: 'autre-voyageur',
      body: 'Coucou',
      idempotencyKey: 'k3',
    });
    expect(r.kind).toBe('forbidden_not_member');
  });

  it('lead non writable (vu) → lecture seule', async () => {
    const { uc } = await seed({ leadState: 'vu', verified: true });
    const r = await uc.execute({
      conversationId: CONV,
      sender: 'conseiller',
      senderRef: CONS,
      body: 'Salut',
      idempotencyKey: 'k4',
    });
    expect(r.kind).toBe('read_only');
  });

  it('conseiller non vérifié → refus', async () => {
    const { uc } = await seed({ leadState: 'accepte', verified: false });
    const r = await uc.execute({
      conversationId: CONV,
      sender: 'conseiller',
      senderRef: CONS,
      body: 'Salut',
      idempotencyKey: 'k5',
    });
    expect(r.kind).toBe('forbidden_unverified');
  });

  it('message vide → invalide', async () => {
    const { uc } = await seed({ leadState: 'accepte', verified: true });
    const r = await uc.execute({
      conversationId: CONV,
      sender: 'conseiller',
      senderRef: CONS,
      body: '   ',
      idempotencyKey: 'k6',
    });
    expect(r.kind).toBe('invalid_message');
  });
});
