// T028 [US3] [TDD] — Anonymisation Loi 25 d'un fil : corps des messages → null,
// pièces jointes supprimées (S3 + deletedAt), références voyageur neutralisées,
// **audit préservé** (lignes/ids/horodatages conservés), idempotent.

import { describe, expect, it } from 'vitest';
import { FakeAttachmentStorage, FakeConversationRepo } from '../../__tests__/_conversation-fakes';
import { FakeClock } from '../../__tests__/_lead-fakes';
import { AnonymizeConversationLoi25UseCase } from '../anonymize-conversation-loi25.use-case';

const CONV = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const LEAD = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CONS = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const BRIEF = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const VOY = 'voy-ref-1';

async function seed() {
  const repo = new FakeConversationRepo();
  await repo.createConversation({
    id: CONV,
    leadId: LEAD,
    conseillerId: CONS,
    briefId: BRIEF,
    voyageurRef: VOY,
    openedAt: new Date('2026-06-07T11:00:00Z'),
  });
  await repo.appendMessage({
    id: '11111111-1111-4111-8111-111111111111',
    conversationId: CONV,
    author: 'voyageur',
    body: 'Mon nom est Jean Tremblay, 514-555-0199.',
    idempotencyKey: 'm1',
    createdAt: new Date('2026-06-07T12:00:00Z'),
  });
  await repo.appendMessage({
    id: '22222222-2222-4222-8222-222222222222',
    conversationId: CONV,
    author: 'conseiller',
    body: 'Bien reçu, voici mon devis.',
    idempotencyKey: 'm2',
    createdAt: new Date('2026-06-07T12:05:00Z'),
  });
  await repo.createAttachment({
    id: '33333333-3333-4333-8333-333333333333',
    messageId: '22222222-2222-4222-8222-222222222222',
    fileName: 'devis.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 2048,
    s3Key: `conversations/${CONV}/att1`,
  });
  const storage = new FakeAttachmentStorage();
  const uc = new AnonymizeConversationLoi25UseCase({
    clock: new FakeClock(new Date('2026-06-10T09:00:00Z')),
    repo,
    storage,
  });
  return { repo, storage, uc };
}

describe('AnonymizeConversationLoi25 (US3)', () => {
  it('neutralise corps + pièces jointes + refs, conserve l’audit', async () => {
    const { repo, storage, uc } = await seed();
    const r = await uc.execute({ conversationId: CONV });
    expect(r).toEqual({ kind: 'anonymized', messagesNeutralized: 2, attachmentsDeleted: 1 });

    // Corps neutralisés mais lignes (audit) conservées.
    expect(repo.messages).toHaveLength(2);
    expect(repo.messages.every((m) => m.body === null)).toBe(true);
    expect(repo.messages[0]?.id).toBe('11111111-1111-4111-8111-111111111111');
    expect(repo.messages[0]?.createdAt).toBeInstanceOf(Date);

    // Objet S3 supprimé + deletedAt posé (métadonnées conservées).
    expect(storage.deleted).toContain(`conversations/${CONV}/att1`);
    expect(repo.attachments[0]?.deletedAt).not.toBeNull();

    // Références voyageur neutralisées.
    const conv = await repo.findById(CONV);
    expect(conv?.briefId).toBeNull();
    expect(conv?.voyageurRef).toBeNull();
  });

  it('idempotent : 2e passage ne re-supprime rien', async () => {
    const { storage, uc } = await seed();
    await uc.execute({ conversationId: CONV });
    const r2 = await uc.execute({ conversationId: CONV });
    expect(r2).toEqual({ kind: 'anonymized', messagesNeutralized: 0, attachmentsDeleted: 0 });
    // L'objet S3 n'est supprimé qu'une fois (déjà retiré de la liste non-supprimés).
    expect(storage.deleted).toHaveLength(1);
  });

  it('fil inexistant → not_found', async () => {
    const { uc } = await seed();
    const r = await uc.execute({ conversationId: '99999999-9999-4999-8999-999999999999' });
    expect(r.kind).toBe('not_found');
  });
});
