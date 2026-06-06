// T033 [TDD RED] — Machine d'état du lead (fonction pure, ADR-0025).
// Table de transitions complète, transition hors table rejetée, no-op
// idempotent (marquer_vu déjà vu+), clore_systeme → perdu depuis tout état
// non terminal. Principe VI NON-NÉGOCIABLE.

import { describe, expect, it } from 'vitest';
import { applyLeadTransition } from '../apply-lead-transition';

describe('applyLeadTransition — table nominale', () => {
  it('envoye + marquer_vu (conseiller) → applied vu', () => {
    expect(applyLeadTransition('envoye', 'marquer_vu', 'conseiller')).toEqual({
      kind: 'applied',
      toState: 'vu',
    });
  });

  it('vu + accepter → accepte ; vu + refuser → refuse', () => {
    expect(applyLeadTransition('vu', 'accepter', 'conseiller')).toEqual({
      kind: 'applied',
      toState: 'accepte',
    });
    expect(applyLeadTransition('vu', 'refuser', 'conseiller')).toEqual({
      kind: 'applied',
      toState: 'refuse',
    });
  });

  it('accepte + marquer_devis_envoye → devis_envoye', () => {
    expect(applyLeadTransition('accepte', 'marquer_devis_envoye', 'conseiller')).toEqual({
      kind: 'applied',
      toState: 'devis_envoye',
    });
  });

  it('devis_envoye + marquer_reservation_confirmee → reservation_confirmee', () => {
    expect(
      applyLeadTransition('devis_envoye', 'marquer_reservation_confirmee', 'conseiller'),
    ).toEqual({ kind: 'applied', toState: 'reservation_confirmee' });
  });

  it('marquer_perdu depuis tout état non terminal → perdu', () => {
    for (const s of ['envoye', 'vu', 'accepte', 'devis_envoye'] as const) {
      expect(applyLeadTransition(s, 'marquer_perdu', 'conseiller')).toEqual({
        kind: 'applied',
        toState: 'perdu',
      });
    }
  });
});

describe('applyLeadTransition — clore_systeme', () => {
  it('clore_systeme (systeme) → perdu depuis tout état non terminal', () => {
    for (const s of ['envoye', 'vu', 'accepte', 'devis_envoye'] as const) {
      expect(applyLeadTransition(s, 'clore_systeme', 'systeme')).toEqual({
        kind: 'applied',
        toState: 'perdu',
      });
    }
  });

  it('clore_systeme par un conseiller → rejeté (action système uniquement)', () => {
    expect(applyLeadTransition('vu', 'clore_systeme', 'conseiller').kind).toBe('rejected');
  });

  it('clore_systeme sur un état terminal → rejeté', () => {
    for (const s of ['refuse', 'reservation_confirmee', 'perdu'] as const) {
      expect(applyLeadTransition(s, 'clore_systeme', 'systeme').kind).toBe('rejected');
    }
  });
});

describe('applyLeadTransition — idempotence marquer_vu (FR-019)', () => {
  it('marquer_vu sur vu ou au-delà → no-op (pas de régression, pas d’erreur)', () => {
    for (const s of [
      'vu',
      'accepte',
      'devis_envoye',
      'reservation_confirmee',
      'refuse',
      'perdu',
    ] as const) {
      expect(applyLeadTransition(s, 'marquer_vu', 'conseiller')).toEqual({ kind: 'noop' });
    }
  });
});

describe('applyLeadTransition — transitions illégales rejetées (SC-003)', () => {
  it('envoye + accepter → rejeté (doit passer par vu)', () => {
    expect(applyLeadTransition('envoye', 'accepter', 'conseiller').kind).toBe('rejected');
  });

  it('envoye + marquer_reservation_confirmee → rejeté', () => {
    expect(applyLeadTransition('envoye', 'marquer_reservation_confirmee', 'conseiller').kind).toBe(
      'rejected',
    );
  });

  it('toute action (hors marquer_vu) sur un état terminal → rejeté', () => {
    for (const s of ['refuse', 'reservation_confirmee', 'perdu'] as const) {
      expect(applyLeadTransition(s, 'accepter', 'conseiller').kind).toBe('rejected');
      expect(applyLeadTransition(s, 'marquer_perdu', 'conseiller').kind).toBe('rejected');
    }
  });

  it('accepter sur accepte → rejeté (pas de ré-acceptation)', () => {
    expect(applyLeadTransition('accepte', 'accepter', 'conseiller').kind).toBe('rejected');
  });
});
