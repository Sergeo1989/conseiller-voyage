// T011 [US1] [TDD GREEN] — Ouvre un fil de conversation à l'acceptation d'un lead
// (FR-001). Idempotent : un fil par lead (findByLeadId + createConversation
// idempotent sur leadId). Ne lit/écrit aucune transition de lead (012 = source
// de vérité).

import type { Clock } from '../../../../common/ports/clock.port';
import type { UuidGenerator } from '../../../../common/ports/uuid-generator.port';
import {
  type ConversationMetricsRecorder,
  type ConversationRepo,
  noopConversationMetricsRecorder,
} from '../ports';

export interface OpenConversationDeps {
  readonly clock: Clock;
  readonly uuid: UuidGenerator;
  readonly repo: ConversationRepo;
  /** Optionnel — no-op par défaut (tests). */
  readonly metrics?: ConversationMetricsRecorder;
}

export interface OpenConversationInput {
  readonly leadId: string;
  readonly conseillerId: string;
  readonly briefId: string | null;
  readonly voyageurRef: string | null;
}

export type OpenConversationResult =
  | { readonly kind: 'opened'; readonly conversationId: string }
  | { readonly kind: 'already_open'; readonly conversationId: string };

export class OpenConversationOnLeadAcceptedUseCase {
  constructor(private readonly deps: OpenConversationDeps) {}

  async execute(input: OpenConversationInput): Promise<OpenConversationResult> {
    const existing = await this.deps.repo.findByLeadId(input.leadId);
    if (existing) return { kind: 'already_open', conversationId: existing.id };

    const res = await this.deps.repo.createConversation({
      id: this.deps.uuid.generate(),
      leadId: input.leadId,
      conseillerId: input.conseillerId,
      briefId: input.briefId,
      voyageurRef: input.voyageurRef,
      openedAt: this.deps.clock.now(),
    });
    if (res.kind === 'created') {
      (this.deps.metrics ?? noopConversationMetricsRecorder).recordConversationOpened();
      return { kind: 'opened', conversationId: res.conversationId };
    }
    return { kind: 'already_open', conversationId: res.conversationId };
  }
}
