// T020 [US2] [TDD] — Pièces jointes : upload pré-signé → finalize → URL signée.
// Validation type/poids (domaine), autorisation membre, statuts pending→ready,
// aucun champ transactionnel. Couvre CreateAttachmentUpload / FinalizeAttachment
// / GetAttachmentUrl via fakes.

import { describe, expect, it } from 'vitest';
import { FakeAttachmentStorage, FakeConversationRepo } from '../../__tests__/_conversation-fakes';
import { FakeUuidGenerator } from '../../__tests__/_lead-fakes';
import { CreateAttachmentUploadUseCase } from '../create-attachment-upload.use-case';
import { FinalizeAttachmentUseCase } from '../finalize-attachment.use-case';
import { GetAttachmentUrlUseCase } from '../get-attachment-url.use-case';

const CONV = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const LEAD = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CONS = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const BRIEF = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const VOY = 'voy-ref-1';
const MSG = '11111111-1111-4111-8111-111111111111';

const PDF = 'application/pdf';

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
    id: MSG,
    conversationId: CONV,
    author: 'conseiller',
    body: 'Voici mon devis.',
    idempotencyKey: 'm1',
    createdAt: new Date('2026-06-07T12:00:00Z'),
  });
  const storage = new FakeAttachmentStorage();
  const create = new CreateAttachmentUploadUseCase({
    uuid: new FakeUuidGenerator(),
    repo,
    storage,
  });
  const finalize = new FinalizeAttachmentUseCase({ repo });
  const getUrl = new GetAttachmentUrlUseCase({ repo, storage });
  return { repo, storage, create, finalize, getUrl };
}

describe('Attachments (US2)', () => {
  it('PDF valide → URL d’upload pré-signée + enregistrement pending_upload', async () => {
    const { repo, storage, create } = await seed();
    const r = await create.execute({
      messageId: MSG,
      requester: 'conseiller',
      requesterRef: CONS,
      fileName: 'devis.pdf',
      mimeType: PDF,
      sizeBytes: 1024,
    });
    expect(r.kind).toBe('created');
    if (r.kind !== 'created') return;
    expect(r.uploadUrl).toContain('upload');
    expect(storage.uploads).toHaveLength(1);
    expect(repo.attachments[0]?.status).toBe('pending_upload');
  });

  it('type non autorisé → invalid_attachment(type)', async () => {
    const { create } = await seed();
    const r = await create.execute({
      messageId: MSG,
      requester: 'conseiller',
      requesterRef: CONS,
      fileName: 'malware.exe',
      mimeType: 'application/x-msdownload',
      sizeBytes: 1024,
    });
    expect(r).toEqual({ kind: 'invalid_attachment', reason: 'type' });
  });

  it('fichier trop volumineux → invalid_attachment(too_large)', async () => {
    const { create } = await seed();
    const r = await create.execute({
      messageId: MSG,
      requester: 'conseiller',
      requesterRef: CONS,
      fileName: 'gros.pdf',
      mimeType: PDF,
      sizeBytes: 11 * 1024 * 1024,
    });
    expect(r).toEqual({ kind: 'invalid_attachment', reason: 'too_large' });
  });

  it('non-membre → forbidden_not_member', async () => {
    const { create } = await seed();
    const r = await create.execute({
      messageId: MSG,
      requester: 'voyageur',
      requesterRef: 'autre-voyageur',
      fileName: 'devis.pdf',
      mimeType: PDF,
      sizeBytes: 1024,
    });
    expect(r.kind).toBe('forbidden_not_member');
  });

  it('message inexistant → not_found', async () => {
    const { create } = await seed();
    const r = await create.execute({
      messageId: '22222222-2222-4222-8222-222222222222',
      requester: 'conseiller',
      requesterRef: CONS,
      fileName: 'devis.pdf',
      mimeType: PDF,
      sizeBytes: 1024,
    });
    expect(r.kind).toBe('not_found');
  });

  it('finalize → ready (idempotent) ; URL de lecture seulement après ready', async () => {
    const { repo, create, finalize, getUrl } = await seed();
    const created = await create.execute({
      messageId: MSG,
      requester: 'conseiller',
      requesterRef: CONS,
      fileName: 'devis.pdf',
      mimeType: PDF,
      sizeBytes: 2048,
    });
    if (created.kind !== 'created') throw new Error('setup');
    const id = created.attachmentId;

    // Avant finalize → not_ready.
    const before = await getUrl.execute({
      attachmentId: id,
      requester: 'voyageur',
      requesterRef: VOY,
    });
    expect(before.kind).toBe('not_ready');

    const f1 = await finalize.execute({
      attachmentId: id,
      requester: 'conseiller',
      requesterRef: CONS,
    });
    expect(f1.kind).toBe('finalized');
    expect(repo.attachments[0]?.status).toBe('ready');
    // Idempotent.
    const f2 = await finalize.execute({
      attachmentId: id,
      requester: 'conseiller',
      requesterRef: CONS,
    });
    expect(f2.kind).toBe('finalized');

    // Lecture par l'autre membre (voyageur) → URL signée courte.
    const after = await getUrl.execute({
      attachmentId: id,
      requester: 'voyageur',
      requesterRef: VOY,
    });
    expect(after.kind).toBe('ok');
    if (after.kind === 'ok') expect(after.url).toContain('download');
  });

  it('lecture par non-membre → forbidden_not_member', async () => {
    const { create, finalize, getUrl } = await seed();
    const created = await create.execute({
      messageId: MSG,
      requester: 'conseiller',
      requesterRef: CONS,
      fileName: 'devis.pdf',
      mimeType: PDF,
      sizeBytes: 2048,
    });
    if (created.kind !== 'created') throw new Error('setup');
    await finalize.execute({
      attachmentId: created.attachmentId,
      requester: 'conseiller',
      requesterRef: CONS,
    });
    const r = await getUrl.execute({
      attachmentId: created.attachmentId,
      requester: 'conseiller',
      requesterRef: 'autre-conseiller',
    });
    expect(r.kind).toBe('forbidden_not_member');
  });
});
