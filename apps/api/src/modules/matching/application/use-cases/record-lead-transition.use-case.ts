// T037 [TDD GREEN] — RecordLeadTransitionUseCase (US2).
//
// Pipeline : charge le lead → autorisation propriétaire → re-check verified
// (FR-008) → machine d'état pure depuis l'état ATTENDU (distingue 422 invalide
// vs 409 conflit) → appendTransition avec guard de concurrence optimiste
// (WHERE current_state = expected, FR-020).
//
// 409 (conflit) : l'action serait valide depuis l'état attendu mais l'état réel
// a bougé. 422 (invalide) : l'action n'est pas autorisée depuis l'état attendu.

import type { ConformiteQueryPort } from '@cv/shared/conformite';
import type { LeadState } from '@cv/shared/matching';
import type { Clock } from '../../../../common/ports/clock.port';
import type { UuidGenerator } from '../../../../common/ports/uuid-generator.port';
import { applyLeadTransition } from '../../domain/services/apply-lead-transition';
import {
  type ConversationOpener,
  type LeadMetricsRecorder,
  type LeadReader,
  type LeadWriter,
  noopLeadMetricsRecorder,
} from '../ports';

/** Actions exposées au conseiller (clore_systeme est réservé au système). */
export type ConseillerLeadAction =
  | 'accepter'
  | 'refuser'
  | 'marquer_devis_envoye'
  | 'marquer_reservation_confirmee'
  | 'marquer_perdu';

export interface RecordLeadTransitionDeps {
  readonly clock: Clock;
  readonly uuid: UuidGenerator;
  readonly leadReader: LeadReader;
  readonly leadWriter: LeadWriter;
  readonly conformiteQuery: ConformiteQueryPort;
  /** Optionnel — no-op par défaut (tests). */
  readonly metrics?: LeadMetricsRecorder;
  /**
   * Optionnel (013, T016) — ouvre le fil de conversation lorsque la transition
   * mène à `accepté` (FR-001). Best-effort : un échec n'annule pas la transition.
   */
  readonly conversationOpener?: ConversationOpener;
}

export interface RecordLeadTransitionInput {
  readonly leadId: string;
  readonly conseillerId: string;
  readonly action: ConseillerLeadAction;
  readonly reason?: string | null;
  /** État cru par l'appelant (guard concurrence optimiste). */
  readonly expectedState?: LeadState;
}

export type RecordLeadTransitionResult =
  | { readonly kind: 'applied'; readonly newState: LeadState }
  | { readonly kind: 'noop'; readonly state: LeadState }
  | { readonly kind: 'not_found' }
  | { readonly kind: 'forbidden_not_owner' }
  | { readonly kind: 'forbidden_unverified' }
  | { readonly kind: 'invalid_transition' }
  | { readonly kind: 'conflict' };

export class RecordLeadTransitionUseCase {
  static readonly DEPS_TOKEN = Symbol.for('RecordLeadTransitionDeps');

  constructor(private readonly deps: RecordLeadTransitionDeps) {}

  async execute(input: RecordLeadTransitionInput): Promise<RecordLeadTransitionResult> {
    const lead = await this.deps.leadReader.findById(input.leadId);
    if (!lead) return { kind: 'not_found' };
    if (lead.conseillerId !== input.conseillerId) return { kind: 'forbidden_not_owner' };

    const status = await this.deps.conformiteQuery.getVerificationStatus({
      conseillerId: input.conseillerId,
      strict: true,
    });
    if (!status.verified) return { kind: 'forbidden_unverified' };

    const basis = input.expectedState ?? lead.currentState;
    const outcome = applyLeadTransition(basis, input.action, 'conseiller');
    if (outcome.kind === 'rejected') return { kind: 'invalid_transition' };
    if (outcome.kind === 'noop') return { kind: 'noop', state: basis };

    const appended = await this.deps.leadWriter.appendTransition({
      transitionId: this.deps.uuid.generate(),
      leadId: lead.id,
      expectedState: basis,
      fromState: basis,
      toState: outcome.toState,
      action: input.action,
      actor: 'conseiller',
      actorId: input.conseillerId,
      reason: input.reason ?? null,
      occurredAt: this.deps.clock.now(),
    });
    if (appended.kind === 'conflict') return { kind: 'conflict' };
    (this.deps.metrics ?? noopLeadMetricsRecorder).recordLeadTransition(outcome.toState);

    if (outcome.toState === 'accepte') {
      await this.openConversationOnAccept(lead.id, input.conseillerId, lead.briefId);
    }

    return { kind: 'applied', newState: outcome.toState };
  }

  /**
   * T016 (013, FR-001) — l'acceptation ouvre le fil de conversation. Idempotent
   * (un fil par lead) et best-effort : la transition est déjà persistée, un échec
   * d'ouverture ne doit pas la faire échouer (POST /open + sweep = filets).
   */
  private async openConversationOnAccept(
    leadId: string,
    conseillerId: string,
    briefId: string | null,
  ): Promise<void> {
    if (!this.deps.conversationOpener) return;
    try {
      await this.deps.conversationOpener.openForAcceptedLead({ leadId, conseillerId, briefId });
    } catch {
      // Avalé volontairement — relogué par l'adaptateur.
    }
  }
}
