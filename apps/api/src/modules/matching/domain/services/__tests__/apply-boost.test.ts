// T065 [TDD RED] — Tests applyBoost (US2 P2 boost cookie cv_suggested).
//
// Pure function : score brut → score final + flag boosted.
//   - suggestedConseillerId === conseillerId : boost appliqué (×1.10)
//   - mismatch ou null : no-op (scoreFinal = scoreBrut)
//   - cap dur ≤ 1.10 (FR-011/FR-012)
//   - le boost ne fait pas qu'un non-éligible devienne éligible (le filtre
//     verified+langue+adresse a lieu en amont — applyBoost suppose conseiller
//     éligible)

import { describe, expect, it } from 'vitest';
import { Score } from '../../value-objects/score.vo';
import { applyBoost } from '../apply-boost';

const FACTOR_MAX = 1.1; // FR-011

describe('applyBoost', () => {
  it('suggestedConseillerId === conseillerId : boost appliqué', () => {
    const result = applyBoost({
      scoreBrut: Score.fromNumber(0.5),
      conseillerId: 'id-a',
      suggestedConseillerId: 'id-a',
      factorMax: FACTOR_MAX,
    });
    expect(result.scoreFinal.value).toBeCloseTo(0.55, 6);
    expect(result.boosted).toBe(true);
  });

  it('suggestedConseillerId !== conseillerId : no-op', () => {
    const result = applyBoost({
      scoreBrut: Score.fromNumber(0.5),
      conseillerId: 'id-a',
      suggestedConseillerId: 'id-b',
      factorMax: FACTOR_MAX,
    });
    expect(result.scoreFinal.value).toBe(0.5);
    expect(result.boosted).toBe(false);
  });

  it('suggestedConseillerId null : no-op (cookie absent ou invalide)', () => {
    const result = applyBoost({
      scoreBrut: Score.fromNumber(0.5),
      conseillerId: 'id-a',
      suggestedConseillerId: null,
      factorMax: FACTOR_MAX,
    });
    expect(result.scoreFinal.value).toBe(0.5);
    expect(result.boosted).toBe(false);
  });

  it('cap +10% strict : scoreBrut 1.0 boosté → 1.10 (jamais au-delà)', () => {
    const result = applyBoost({
      scoreBrut: Score.fromNumber(1.0),
      conseillerId: 'id-a',
      suggestedConseillerId: 'id-a',
      factorMax: FACTOR_MAX,
    });
    expect(result.scoreFinal.value).toBe(1.1);
    expect(result.boosted).toBe(true);
  });

  it('cap +10% strict : factorMax > 1.10 (hypothétique) cap quand même à 1.10', () => {
    const result = applyBoost({
      scoreBrut: Score.fromNumber(1.0),
      conseillerId: 'id-a',
      suggestedConseillerId: 'id-a',
      factorMax: 1.5, // demande absurde
    });
    expect(result.scoreFinal.value).toBeLessThanOrEqual(1.1);
  });

  it('SC-002 déterminisme : 2 appels identiques → mêmes valeurs', () => {
    const a = applyBoost({
      scoreBrut: Score.fromNumber(0.73),
      conseillerId: 'id-a',
      suggestedConseillerId: 'id-a',
      factorMax: FACTOR_MAX,
    });
    const b = applyBoost({
      scoreBrut: Score.fromNumber(0.73),
      conseillerId: 'id-a',
      suggestedConseillerId: 'id-a',
      factorMax: FACTOR_MAX,
    });
    expect(a.scoreFinal.value).toBe(b.scoreFinal.value);
    expect(a.boosted).toBe(b.boosted);
  });

  it('SC-004 invariant : scoreFinal ≤ scoreBrut × factorMax + 1e-6', () => {
    const result = applyBoost({
      scoreBrut: Score.fromNumber(0.42),
      conseillerId: 'id-a',
      suggestedConseillerId: 'id-a',
      factorMax: FACTOR_MAX,
    });
    expect(result.scoreFinal.value).toBeLessThanOrEqual(0.42 * 1.1 + 1e-6);
  });
});
