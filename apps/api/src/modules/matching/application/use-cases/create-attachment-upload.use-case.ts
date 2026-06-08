// T021 [US2] — CreateAttachmentUpload : valide la pièce jointe (domaine), crée
// l'enregistrement `pending_upload` et renvoie une URL S3 pré-signée (PUT). Le
// binaire ne transite jamais par l'API. Autorisation : membre du fil du message.
// AUCUN champ transactionnel (ADR-0002) — le devis est un fichier opaque.

import type { ConversationParticipant } from '@cv/shared/matching';
import type { UuidGenerator } from '../../../../common/ports/uuid-generator.port';
import { validateAttachment } from '../../domain/services/conversation-policy';
import type { AttachmentStorage, ConversationRepo } from '../ports';

export interface CreateAttachmentUploadDeps {
  readonly uuid: UuidGenerator;
  readonly repo: ConversationRepo;
  readonly storage: AttachmentStorage;
}

export interface CreateAttachmentUploadInput {
  readonly messageId: string;
  readonly requester: ConversationParticipant;
  readonly requesterRef: string;
  readonly fileName: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
}

export type CreateAttachmentUploadResult =
  | {
      readonly kind: 'created';
      readonly attachmentId: string;
      readonly uploadUrl: string;
      readonly expiresInSec: number;
    }
  | { readonly kind: 'not_found' }
  | { readonly kind: 'forbidden_not_member' }
  | { readonly kind: 'invalid_attachment'; readonly reason: 'type' | 'too_large' | 'empty' };

function isMember(
  conv: { conseillerId: string; voyageurRef: string | null },
  requester: ConversationParticipant,
  ref: string,
): boolean {
  return requester === 'conseiller' ? conv.conseillerId === ref : conv.voyageurRef === ref;
}

export class CreateAttachmentUploadUseCase {
  constructor(private readonly deps: CreateAttachmentUploadDeps) {}

  async execute(input: CreateAttachmentUploadInput): Promise<CreateAttachmentUploadResult> {
    const validation = validateAttachment(input.mimeType, input.sizeBytes);
    if (!validation.ok) return { kind: 'invalid_attachment', reason: validation.reason };

    const message = await this.deps.repo.findMessageById(input.messageId);
    if (!message) return { kind: 'not_found' };
    const conv = await this.deps.repo.findById(message.conversationId);
    if (!conv) return { kind: 'not_found' };
    if (!isMember(conv, input.requester, input.requesterRef)) {
      return { kind: 'forbidden_not_member' };
    }

    const attachmentId = this.deps.uuid.generate();
    const s3Key = `conversations/${conv.id}/${attachmentId}`;
    await this.deps.repo.createAttachment({
      id: attachmentId,
      messageId: message.id,
      fileName: input.fileName,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      s3Key,
    });

    const presigned = await this.deps.storage.presignUpload(s3Key, input.mimeType);
    return {
      kind: 'created',
      attachmentId,
      uploadUrl: presigned.url,
      expiresInSec: presigned.expiresInSec,
    };
  }
}
