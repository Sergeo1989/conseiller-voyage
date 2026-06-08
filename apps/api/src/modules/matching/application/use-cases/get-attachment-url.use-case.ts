// T023 [US2] — GetAttachmentUrl : renvoie une URL S3 signée à durée courte pour
// lire une pièce jointe `ready` non supprimée. Autorisation : membre du fil
// uniquement (pas d'accès public). Lecture seule du devis opaque (ADR-0002).

import type { ConversationParticipant } from '@cv/shared/matching';
import type { AttachmentStorage, ConversationRepo } from '../ports';

export interface GetAttachmentUrlDeps {
  readonly repo: ConversationRepo;
  readonly storage: AttachmentStorage;
}

export interface GetAttachmentUrlInput {
  readonly attachmentId: string;
  readonly requester: ConversationParticipant;
  readonly requesterRef: string;
}

export type GetAttachmentUrlResult =
  | {
      readonly kind: 'ok';
      readonly url: string;
      readonly expiresInSec: number;
      readonly fileName: string;
    }
  | { readonly kind: 'not_found' }
  | { readonly kind: 'not_ready' }
  | { readonly kind: 'forbidden_not_member' };

export class GetAttachmentUrlUseCase {
  constructor(private readonly deps: GetAttachmentUrlDeps) {}

  async execute(input: GetAttachmentUrlInput): Promise<GetAttachmentUrlResult> {
    const att = await this.deps.repo.findAttachmentById(input.attachmentId);
    if (!att || att.deletedAt) return { kind: 'not_found' };
    const conv = await this.deps.repo.findById(att.conversationId);
    if (!conv) return { kind: 'not_found' };
    const isMember =
      input.requester === 'conseiller'
        ? conv.conseillerId === input.requesterRef
        : conv.voyageurRef === input.requesterRef;
    if (!isMember) return { kind: 'forbidden_not_member' };
    if (att.status !== 'ready') return { kind: 'not_ready' };

    const presigned = await this.deps.storage.presignDownload(att.s3Key, att.fileName);
    return {
      kind: 'ok',
      url: presigned.url,
      expiresInSec: presigned.expiresInSec,
      fileName: att.fileName,
    };
  }
}
