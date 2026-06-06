// T039 [TDD GREEN] — ViewLeadUseCase (US2, FR-019).
//
// Consultation d'un lead par son propriétaire. Effet de bord : transition
// automatique envoye → vu à la 1re consultation (idempotente — une relecture
// ne crée pas de nouvelle transition). La consultation N'exige PAS le statut
// verified (seules les actions le requièrent) — seulement la propriété.

import type { Clock } from '../../../../common/ports/clock.port';
import type { UuidGenerator } from '../../../../common/ports/uuid-generator.port';
import { applyLeadTransition } from '../../domain/services/apply-lead-transition';
import type { LeadReader, LeadWithHistory, LeadWriter } from '../ports';

export interface ViewLeadDeps {
  readonly clock: Clock;
  readonly uuid: UuidGenerator;
  readonly leadReader: LeadReader;
  readonly leadWriter: LeadWriter;
}

export interface ViewLeadInput {
  readonly leadId: string;
  readonly conseillerId: string;
}

export type ViewLeadResult =
  | { readonly kind: 'ok'; readonly lead: LeadWithHistory }
  | { readonly kind: 'not_found' }
  | { readonly kind: 'forbidden_not_owner' };

export class ViewLeadUseCase {
  static readonly DEPS_TOKEN = Symbol.for('ViewLeadDeps');

  constructor(private readonly deps: ViewLeadDeps) {}

  async execute(input: ViewLeadInput): Promise<ViewLeadResult> {
    const lead = await this.deps.leadReader.findById(input.leadId);
    if (!lead) return { kind: 'not_found' };
    if (lead.conseillerId !== input.conseillerId) return { kind: 'forbidden_not_owner' };

    // Auto-vu idempotent : applied seulement depuis envoye (sinon no-op).
    const outcome = applyLeadTransition(lead.currentState, 'marquer_vu', 'conseiller');
    if (outcome.kind === 'applied') {
      await this.deps.leadWriter.appendTransition({
        transitionId: this.deps.uuid.generate(),
        leadId: lead.id,
        expectedState: lead.currentState,
        fromState: lead.currentState,
        toState: outcome.toState,
        action: 'marquer_vu',
        actor: 'conseiller',
        actorId: input.conseillerId,
        reason: null,
        occurredAt: this.deps.clock.now(),
      });
      // Concurrence : si un autre process a déplacé l'état entre-temps, le guard
      // a échoué (conflict) — on ignore et relit l'état réel ci-dessous.
    }

    const fresh = await this.deps.leadReader.findById(input.leadId);
    return { kind: 'ok', lead: fresh ?? lead };
  }
}
