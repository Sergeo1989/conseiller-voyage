// T035 [TDD RED+GREEN] — Property tests de la machine d'état (fast-check).
//   - SC-003 : aucune transition illégale acceptée (oracle indépendant).
//   - FR-020 : idempotence des montées (marquer_vu rejouable sans double-avance).

import {
  LEAD_ACTIONS,
  LEAD_STATES,
  LEAD_TRANSITION_ACTORS,
  type LeadState,
  isTerminalLeadState,
} from '@cv/shared/matching';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { applyLeadTransition } from '../apply-lead-transition';

const anyState = fc.constantFrom(...LEAD_STATES);
const anyAction = fc.constantFrom(...LEAD_ACTIONS);
const anyActor = fc.constantFrom(...LEAD_TRANSITION_ACTORS);

// Oracle indépendant des transitions légales (≠ implémentation).
const LEGAL: Record<string, LeadState> = {
  'envoye|marquer_vu': 'vu',
  'envoye|marquer_perdu': 'perdu',
  'envoye|clore_systeme': 'perdu',
  'vu|accepter': 'accepte',
  'vu|refuser': 'refuse',
  'vu|marquer_perdu': 'perdu',
  'vu|clore_systeme': 'perdu',
  'accepte|marquer_devis_envoye': 'devis_envoye',
  'accepte|marquer_perdu': 'perdu',
  'accepte|clore_systeme': 'perdu',
  'devis_envoye|marquer_reservation_confirmee': 'reservation_confirmee',
  'devis_envoye|marquer_perdu': 'perdu',
  'devis_envoye|clore_systeme': 'perdu',
};

describe('applyLeadTransition — propriétés (fast-check)', () => {
  it('SC-003 : une transition "applied" est toujours légale et bien ciblée', () => {
    fc.assert(
      fc.property(anyState, anyAction, anyActor, (state, action, actor) => {
        const out = applyLeadTransition(state, action, actor);
        if (out.kind !== 'applied') return; // noop / rejected : rien à prouver ici

        // marquer_vu : seul cas applied = depuis envoye → vu
        if (action === 'marquer_vu') {
          expect(state).toBe('envoye');
          expect(out.toState).toBe('vu');
          return;
        }
        // Acteur cohérent
        if (action === 'clore_systeme') expect(actor).toBe('systeme');
        else expect(actor).toBe('conseiller');
        // La cible correspond à l'oracle (et jamais depuis un état terminal)
        expect(isTerminalLeadState(state)).toBe(false);
        expect(out.toState).toBe(LEGAL[`${state}|${action}`]);
      }),
    );
  });

  it('FR-020 : marquer_vu est idempotent (rejouer → no-op, pas de double-avance)', () => {
    fc.assert(
      fc.property(anyState, anyActor, (state, actor) => {
        const first = applyLeadTransition(state, 'marquer_vu', actor);
        const after: LeadState = first.kind === 'applied' ? first.toState : state;
        const second = applyLeadTransition(after, 'marquer_vu', actor);
        // Après une 1re application/relecture, marquer_vu ne fait jamais avancer.
        expect(second.kind).toBe('noop');
      }),
    );
  });

  it('aucune action ne fait sortir d’un état terminal', () => {
    fc.assert(
      fc.property(anyAction, anyActor, (action, actor) => {
        for (const s of LEAD_STATES.filter(isTerminalLeadState)) {
          const out = applyLeadTransition(s, action, actor);
          // Terminal : soit rejected, soit no-op (marquer_vu) — jamais applied.
          expect(out.kind).not.toBe('applied');
        }
      }),
    );
  });
});
