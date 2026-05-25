// T031 — Test TDD pour isTransitionAllowed (Principe VI NON-NÉGOCIABLE).
// Écrit AVANT l'implémentation T042 → RED.
//
// Source de vérité de la machine d'état : spec.md *Entités clés > Statut*
// + data-model.md *Machine d'état du statut conformité*.

import { describe, expect, it } from 'vitest';
import {
  CONFORMITE_STATUSES,
  type ConformiteStatus,
} from '../../value-objects/conformite-status.vo';
import { isTransitionAllowed } from '../is-transition-allowed';

const ALLOWED: ReadonlyArray<readonly [ConformiteStatus, ConformiteStatus]> = [
  ['pending', 'pending'], // refus admin → reste pending, peut re-soumettre
  ['pending', 'verified'], // approbation initiale (US1)
  ['verified', 'suspended'], // expiration auto OU perte d'affiliation (US2 / FR-015)
  ['verified', 'revoked'], // révocation admin (US4)
  ['suspended', 'verified'], // renouvellement approuvé
  ['suspended', 'revoked'], // révocation admin sur conseiller suspendu
  ['revoked', 'pending'], // nouvelle soumission complète (US4 acceptance #2)
];

describe('isTransitionAllowed (T031)', () => {
  describe('autorise les 7 transitions du modèle de spec', () => {
    for (const [from, to] of ALLOWED) {
      it(`accepte ${from} → ${to}`, () => {
        expect(isTransitionAllowed(from, to)).toBe(true);
      });
    }
  });

  describe('refuse toutes les autres transitions (4x4 - 7 = 9 cas)', () => {
    const allowedSet = new Set(ALLOWED.map(([f, t]) => `${f}->${t}`));
    const forbidden = CONFORMITE_STATUSES.flatMap((from) =>
      CONFORMITE_STATUSES.filter((to) => !allowedSet.has(`${from}->${to}`)).map(
        (to) => [from, to] as const,
      ),
    );

    for (const [from, to] of forbidden) {
      it(`refuse ${from} → ${to}`, () => {
        expect(isTransitionAllowed(from, to)).toBe(false);
      });
    }
  });

  it('refuse explicitement revoked → verified (état final, demande une re-soumission)', () => {
    expect(isTransitionAllowed('revoked', 'verified')).toBe(false);
  });

  it('refuse explicitement revoked → suspended (revoked est final)', () => {
    expect(isTransitionAllowed('revoked', 'suspended')).toBe(false);
  });

  it('refuse pending → suspended (suspension exige passage par verified)', () => {
    expect(isTransitionAllowed('pending', 'suspended')).toBe(false);
  });

  it('refuse verified → pending (rétrogradation interdite, doit passer par revoked)', () => {
    expect(isTransitionAllowed('verified', 'pending')).toBe(false);
  });
});
