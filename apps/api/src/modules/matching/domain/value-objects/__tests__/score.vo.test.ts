// T032 [TDD RED] — Tests Score VO.
// Score est un decimal immutable ∈ [0, 1.1] : 0 = aucun match, 1 = match parfait,
// 1.1 = match parfait boosté +10% (FR-011 plafond strict).

import { describe, expect, it } from 'vitest';
import { Score } from '../score.vo';

describe('Score VO', () => {
  it('Score.zero retourne 0', () => {
    expect(Score.zero().value).toBe(0);
  });

  it('Score.one retourne 1.0', () => {
    expect(Score.one().value).toBe(1);
  });

  it('Score.fromNumber accepte [0, 1.1]', () => {
    expect(Score.fromNumber(0).value).toBe(0);
    expect(Score.fromNumber(0.5).value).toBe(0.5);
    expect(Score.fromNumber(1).value).toBe(1);
    expect(Score.fromNumber(1.1).value).toBe(1.1);
  });

  it('Score.fromNumber refuse < 0', () => {
    expect(() => Score.fromNumber(-0.001)).toThrow(/Score/);
  });

  it('Score.fromNumber refuse > 1.1', () => {
    expect(() => Score.fromNumber(1.10001)).toThrow(/Score/);
  });

  it('Score.fromNumber refuse NaN', () => {
    expect(() => Score.fromNumber(Number.NaN)).toThrow();
  });

  it('Score.multiplyByFactor applique le facteur et cap à 1.1', () => {
    expect(Score.fromNumber(0.5).multiplyByFactor(1.1).value).toBeCloseTo(0.55, 6);
    // Cap : 1.0 × 1.1 = 1.1 (autorisé)
    expect(Score.fromNumber(1.0).multiplyByFactor(1.1).value).toBe(1.1);
    // Cap dur : 1.1 × 1.5 (hypothétique) DOIT cap à 1.1
    expect(Score.fromNumber(1.0).multiplyByFactor(1.5).value).toBe(1.1);
  });

  it('Score.multiplyByFactor refuse facteur < 1 (boost ne descend jamais)', () => {
    expect(() => Score.fromNumber(0.5).multiplyByFactor(0.99)).toThrow();
  });

  it('Score.equals compare à 1e-6 près (déterminisme SC-002)', () => {
    expect(Score.fromNumber(0.5).equals(Score.fromNumber(0.5))).toBe(true);
    expect(Score.fromNumber(0.5).equals(Score.fromNumber(0.5 + 5e-7))).toBe(true);
    expect(Score.fromNumber(0.5).equals(Score.fromNumber(0.5001))).toBe(false);
  });

  it('Score.isGreaterThan applique strictement', () => {
    expect(Score.fromNumber(0.6).isGreaterThan(Score.fromNumber(0.5))).toBe(true);
    expect(Score.fromNumber(0.5).isGreaterThan(Score.fromNumber(0.5))).toBe(false);
  });
});
