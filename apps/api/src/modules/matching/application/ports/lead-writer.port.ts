// T011 — Port LeadWriter (écriture leads + transitions, feature 012).
//
// Trois opérations :
//   - createLead : insert idempotent (UNIQUE conseiller × matchingResult).
//   - appendTransition : insert d'une transition + maj transactionnelle de
//     `leads.current_state` avec guard de concurrence optimiste
//     (WHERE current_state = expectedState) — FR-020.
//   - closeLeadsSystem : clôture système (→ perdu) des leads non terminaux
//     d'un MatchingResult (re-match / all_matches_revoked) — FR-018 / FR-012.

import type {
  LeadAction,
  LeadState,
  LeadSystemCloseReason,
  LeadTransitionActor,
} from '@cv/shared/matching';

export interface CreateLeadInput {
  readonly id: string;
  readonly matchingResultId: string;
  readonly matchingResultEntryPosition: 1 | 2 | 3;
  readonly conseillerId: string;
  readonly briefId: string | null;
  readonly scoreFinal: number | null;
  readonly boosted: boolean;
  readonly createdAt: Date;
}

// Retourne toujours le leadId (créé OU existant) pour permettre l'enqueue
// idempotent de la notification, y compris sur replay partiel.
export type CreateLeadResult =
  | { readonly kind: 'created'; readonly leadId: string }
  | { readonly kind: 'duplicate'; readonly leadId: string }; // UNIQUE (conseillerId, matchingResultId)

export interface AppendTransitionInput {
  readonly transitionId: string;
  readonly leadId: string;
  /** État courant attendu — guard de concurrence optimiste (FR-020). */
  readonly expectedState: LeadState;
  readonly fromState: LeadState;
  readonly toState: LeadState;
  readonly action: LeadAction;
  readonly actor: LeadTransitionActor;
  readonly actorId: string | null;
  readonly reason: string | null;
  readonly occurredAt: Date;
  /** Motif système posé sur `leads.close_reason` si clôture auto. */
  readonly closeReason?: LeadSystemCloseReason | null;
}

export type AppendTransitionResult = { readonly kind: 'applied' } | { readonly kind: 'conflict' }; // l'état courant ≠ expectedState

export interface CloseLeadsSystemInput {
  readonly matchingResultId: string;
  readonly reason: LeadSystemCloseReason;
  readonly occurredAt: Date;
}

export interface LeadWriter {
  createLead(input: CreateLeadInput): Promise<CreateLeadResult>;

  appendTransition(input: AppendTransitionInput): Promise<AppendTransitionResult>;

  /**
   * Clôture en `perdu` (acteur systeme, action `clore_systeme`) tous les leads
   * **non terminaux** du MatchingResult donné. Append une transition par lead
   * clôturé. Retourne le nombre de leads effectivement clôturés.
   */
  closeLeadsSystem(input: CloseLeadsSystemInput): Promise<number>;
}

export const LEAD_WRITER = Symbol.for('LeadWriter');
