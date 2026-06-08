// T029 [US3] — AnonymizeConversationLoi25 : cascade d'effacement Loi 25 sur un
// fil de conversation (FR-011). Neutralise la PII en CONSERVANT la piste d'audit :
//   - corps des messages → null (les lignes, ids, horodatages, auteur restent) ;
//   - pièces jointes → objet S3 supprimé + `deletedAt` (métadonnées conservées) ;
//   - références voyageur du fil (`briefId`, `voyageurRef`) → null.
// Idempotent : un second passage ne re-supprime rien (corps déjà null, pièces
// déjà supprimées). Aucune donnée transactionnelle (ADR-0002).

import type { Clock } from '../../../../common/ports/clock.port';
import type { AttachmentStorage, ConversationRepo } from '../ports';

export interface AnonymizeConversationLoi25Deps {
  readonly clock: Clock;
  readonly repo: ConversationRepo;
  readonly storage: AttachmentStorage;
}

export interface AnonymizeConversationLoi25Input {
  readonly conversationId: string;
}

export type AnonymizeConversationLoi25Result =
  | {
      readonly kind: 'anonymized';
      readonly messagesNeutralized: number;
      readonly attachmentsDeleted: number;
    }
  | { readonly kind: 'not_found' };

export class AnonymizeConversationLoi25UseCase {
  constructor(private readonly deps: AnonymizeConversationLoi25Deps) {}

  async execute(input: AnonymizeConversationLoi25Input): Promise<AnonymizeConversationLoi25Result> {
    const conv = await this.deps.repo.findById(input.conversationId);
    if (!conv) return { kind: 'not_found' };

    // 1) Pièces jointes : supprime l'objet S3 puis marque `deletedAt` (best-effort
    //    sur S3 — l'effacement DB doit aboutir même si l'objet manque déjà).
    const attachments = await this.deps.repo.listAttachmentsByConversation(input.conversationId);
    let attachmentsDeleted = 0;
    const at = this.deps.clock.now();
    for (const a of attachments) {
      try {
        await this.deps.storage.deleteObject(a.s3Key);
      } catch {
        // Objet déjà absent / S3 transitoire : on poursuit l'effacement des métadonnées.
      }
      await this.deps.repo.markAttachmentDeleted(a.id, at);
      attachmentsDeleted += 1;
    }

    // 2) Corps des messages → null (audit préservé).
    const messagesNeutralized = await this.deps.repo.anonymizeMessageBodies(input.conversationId);

    // 3) Références voyageur du fil → null.
    await this.deps.repo.neutralizeConversationRefs(input.conversationId);

    return { kind: 'anonymized', messagesNeutralized, attachmentsDeleted };
  }
}
