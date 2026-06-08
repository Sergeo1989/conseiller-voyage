// T012 [US1] [TDD GREEN] — Envoie un message dans un fil.
//
// Pipeline : charge le fil → autorisation membre (cloisonnement FR-006) → lit
// l'état du lead (012, source de vérité) + statut vérifié (001) → `canWrite`
// (FR-005, lecture seule sinon) → validation du corps (FR-017) → persistance
// idempotente (FR-004) → 1 entrée d'outbox pour le destinataire (FR-003).
// Aucune donnée transactionnelle (ADR-0002).

import type { ConformiteQueryPort } from '@cv/shared/conformite';
import type { ConversationParticipant } from '@cv/shared/matching';
import type { Clock } from '../../../../common/ports/clock.port';
import type { UuidGenerator } from '../../../../common/ports/uuid-generator.port';
import { Conversation } from '../../domain/entities/conversation.entity';
import { canWrite, validateMessage } from '../../domain/services/conversation-policy';
import {
  type ConversationMetricsRecorder,
  type ConversationNotificationOutbox,
  type ConversationRepo,
  type LeadReader,
  noopConversationMetricsRecorder,
} from '../ports';

export interface SendMessageDeps {
  readonly clock: Clock;
  readonly uuid: UuidGenerator;
  readonly repo: ConversationRepo;
  readonly outbox: ConversationNotificationOutbox;
  readonly leadReader: LeadReader;
  readonly conformiteQuery: ConformiteQueryPort;
  /** Optionnel — no-op par défaut (tests). */
  readonly metrics?: ConversationMetricsRecorder;
}

export interface SendMessageInput {
  readonly conversationId: string;
  readonly sender: ConversationParticipant;
  readonly senderRef: string;
  readonly body: string;
  readonly idempotencyKey: string;
}

export type SendMessageResult =
  | { readonly kind: 'sent'; readonly messageId: string }
  | { readonly kind: 'duplicate'; readonly messageId: string }
  | { readonly kind: 'not_found' }
  | { readonly kind: 'forbidden_not_member' }
  | { readonly kind: 'read_only' }
  | { readonly kind: 'forbidden_unverified' }
  | { readonly kind: 'invalid_message'; readonly reason: 'empty' | 'too_long' };

export class SendMessageUseCase {
  constructor(private readonly deps: SendMessageDeps) {}

  async execute(input: SendMessageInput): Promise<SendMessageResult> {
    const rec = await this.deps.repo.findById(input.conversationId);
    if (!rec) return { kind: 'not_found' };

    const conversation = Conversation.fromProps(rec);
    if (!conversation.isMember(input.sender, input.senderRef)) {
      return { kind: 'forbidden_not_member' };
    }

    // Source de vérité du cycle : l'état du lead (012). Le fil n'écrit aucune transition.
    const lead = await this.deps.leadReader.findById(rec.leadId);
    if (!lead) return { kind: 'read_only' };

    const status = await this.deps.conformiteQuery.getVerificationStatus({
      conseillerId: rec.conseillerId,
    });
    if (!canWrite(lead.currentState, status.verified)) {
      // Vérifié mais état non writable → lecture seule ; sinon non vérifié.
      return status.verified ? { kind: 'read_only' } : { kind: 'forbidden_unverified' };
    }

    const valid = validateMessage(input.body);
    if (!valid.ok) return { kind: 'invalid_message', reason: valid.reason };

    const append = await this.deps.repo.appendMessage({
      id: this.deps.uuid.generate(),
      conversationId: input.conversationId,
      author: input.sender,
      body: valid.value,
      idempotencyKey: input.idempotencyKey,
      createdAt: this.deps.clock.now(),
    });
    // Idempotence : rejeu d'une même clé → aucun doublon (message ni notification).
    if (append.kind === 'duplicate') return { kind: 'duplicate', messageId: append.messageId };

    await this.deps.repo.touchLastMessageAt(input.conversationId, this.deps.clock.now());

    const recipient = conversation.recipientOf(input.sender);
    await this.deps.outbox.enqueue({
      id: this.deps.uuid.generate(),
      messageId: append.messageId,
      recipient,
      idempotencyKey: `convmsg:${append.messageId}:${recipient}`,
      createdAt: this.deps.clock.now(),
    });

    (this.deps.metrics ?? noopConversationMetricsRecorder).recordMessageSent();
    return { kind: 'sent', messageId: append.messageId };
  }
}
