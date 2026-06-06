// T034 [TDD GREEN] — Machine d'état du lead (fonction pure, ADR-0025).
//
// `applyLeadTransition(current, action, actor)` → outcome. Sans I/O, pur,
// déterministe (Principe VI NON-NÉGOCIABLE). Table de transitions explicite
// (SC-003 trivialement vérifiable). Valeurs ASCII snake_case.

import type { LeadAction, LeadState, LeadTransitionActor } from '@cv/shared/matching';

export type LeadTransitionOutcome =
  | { readonly kind: 'applied'; readonly toState: LeadState }
  | { readonly kind: 'noop' } // idempotent (relecture FR-019) — aucune entrée d'historique
  | { readonly kind: 'rejected'; readonly reason: string };

// Table des transitions autorisées : état courant → action → état cible.
// `marquer_vu` et l'idempotence sont gérés à part (cf. fonction). Les états
// terminaux ont une table vide → toute action est rejetée.
const TRANSITIONS: Readonly<Record<LeadState, Partial<Record<LeadAction, LeadState>>>> = {
  envoye: { marquer_perdu: 'perdu', clore_systeme: 'perdu' },
  vu: {
    accepter: 'accepte',
    refuser: 'refuse',
    marquer_perdu: 'perdu',
    clore_systeme: 'perdu',
  },
  accepte: {
    marquer_devis_envoye: 'devis_envoye',
    marquer_perdu: 'perdu',
    clore_systeme: 'perdu',
  },
  devis_envoye: {
    marquer_reservation_confirmee: 'reservation_confirmee',
    marquer_perdu: 'perdu',
    clore_systeme: 'perdu',
  },
  refuse: {},
  reservation_confirmee: {},
  perdu: {},
};

export function applyLeadTransition(
  current: LeadState,
  action: LeadAction,
  actor: LeadTransitionActor,
): LeadTransitionOutcome {
  // marquer_vu : applied seulement depuis envoye, sinon no-op idempotent
  // (relecture FR-019 — ne régresse jamais, n'échoue jamais).
  if (action === 'marquer_vu') {
    return current === 'envoye' ? { kind: 'applied', toState: 'vu' } : { kind: 'noop' };
  }

  // Garde acteur : clore_systeme réservé au système ; les autres au conseiller.
  if (action === 'clore_systeme') {
    if (actor !== 'systeme') {
      return { kind: 'rejected', reason: 'clore_systeme est une action réservée au système' };
    }
  } else if (actor !== 'conseiller') {
    return { kind: 'rejected', reason: `action ${action} réservée au conseiller` };
  }

  const next = TRANSITIONS[current][action];
  if (!next) {
    return { kind: 'rejected', reason: `transition ${current} + ${action} non autorisée` };
  }
  return { kind: 'applied', toState: next };
}
