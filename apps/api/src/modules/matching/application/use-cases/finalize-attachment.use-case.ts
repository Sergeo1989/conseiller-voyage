// T022 [US2] — FinalizeAttachment : après l'upload S3 réussi côté client, passe
// la pièce jointe à `ready` (visible dans le fil). Autorisation : membre du fil.
// Idempotent : finaliser une pièce déjà `ready` reste un succès.

import type { ConversationParticipant } from '@cv/shared/matching';
import type { ConversationRepo } from '../ports';

export interface FinalizeAttachmentDeps {
  readonly repo: ConversationRepo;
}

export interface FinalizeAttachmentInput {
  readonly attachmentId: string;
  readonly requester: ConversationParticipant;
  readonly requesterRef: string;
}

export type FinalizeAttachmentResult =
  | { readonly kind: 'finalized' }
  | { readonly kind: 'not_found' }
  | { readonly kind: 'forbidden_not_member' };

export class FinalizeAttachmentUseCase {
  constructor(private readonly deps: FinalizeAttachmentDeps) {}

  async execute(input: FinalizeAttachmentInput): Promise<FinalizeAttachmentResult> {
    const att = await this.deps.repo.findAttachmentById(input.attachmentId);
    if (!att || att.deletedAt) return { kind: 'not_found' };
    const conv = await this.deps.repo.findById(att.conversationId);
    if (!conv) return { kind: 'not_found' };
    const isMember =
      input.requester === 'conseiller'
        ? conv.conseillerId === input.requesterRef
        : conv.voyageurRef === input.requesterRef;
    if (!isMember) return { kind: 'forbidden_not_member' };

    if (att.status !== 'ready') await this.deps.repo.finalizeAttachment(att.id);
    return { kind: 'finalized' };
  }
}
