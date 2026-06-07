// T020 [GREEN] — Entité LeadTransition (domaine feature 012).
// Historique immuable. Invariants enforcés domain + DB :
//   - actor=conseiller ⇒ actorId présent ; actor=systeme ⇒ actorId null
//     (CHECK DB chk_lead_transition_actor_id)
//   - reason ≤ 500 caractères, jamais de PII
//   - fromState null autorisé (genèse) ; toState requis

import type {
  LeadAction,
  LeadState,
  LeadTransitionActor,
  LeadTransitionId,
} from '@cv/shared/matching';

const REASON_MAX_LENGTH = 500;

export interface LeadTransitionProps {
  readonly id: LeadTransitionId;
  readonly leadId: string;
  readonly fromState: LeadState | null;
  readonly toState: LeadState;
  readonly action: LeadAction;
  readonly actor: LeadTransitionActor;
  readonly actorId: string | null;
  readonly reason: string | null;
  readonly occurredAt: Date;
}

export class LeadTransition {
  private constructor(public readonly props: LeadTransitionProps) {}

  static create(props: LeadTransitionProps): LeadTransition {
    if (props.actor === 'conseiller' && props.actorId === null) {
      throw new Error('LeadTransition invariant : actor=conseiller exige actorId');
    }
    if (props.actor === 'systeme' && props.actorId !== null) {
      throw new Error('LeadTransition invariant : actor=systeme exige actorId null');
    }
    if (props.reason !== null && props.reason.length > REASON_MAX_LENGTH) {
      throw new Error(`LeadTransition invariant : reason > ${REASON_MAX_LENGTH} caractères`);
    }
    return new LeadTransition(props);
  }
}
