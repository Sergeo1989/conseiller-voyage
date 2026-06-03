// T034 [TDD RED] — Tests ScoreComponents VO.
// ScoreComponents = record des 4 axes scorés (destination, geo, speciality,
// familiarity). Chaque composante ∈ [0, 1]. toScoreBrut(weights) calcule
// la combinaison pondérée.

import { describe, expect, it } from 'vitest';
import { ScoreComponents } from '../score-components.vo';
import type { WeightsConfig } from '../weights-config.vo';

const DEFAULT_WEIGHTS: WeightsConfig = {
  destination: 0.35,
  geo: 0.25,
  speciality: 0.25,
  familiarity: 0.15,
};

describe('ScoreComponents VO', () => {
  it('create accepte 4 composantes ∈ [0, 1]', () => {
    const c = ScoreComponents.create({
      destination: 1,
      geo: 0.5,
      speciality: 0.8,
      familiarity: 0.3,
    });
    expect(c.destination).toBe(1);
    expect(c.geo).toBe(0.5);
    expect(c.speciality).toBe(0.8);
    expect(c.familiarity).toBe(0.3);
  });

  it('create refuse une composante < 0', () => {
    expect(() =>
      ScoreComponents.create({ destination: -0.1, geo: 0.5, speciality: 0.5, familiarity: 0.5 }),
    ).toThrow();
  });

  it('create refuse une composante > 1', () => {
    expect(() =>
      ScoreComponents.create({ destination: 1.1, geo: 0.5, speciality: 0.5, familiarity: 0.5 }),
    ).toThrow();
  });

  it('toScoreBrut combine via la pondération injectée', () => {
    const c = ScoreComponents.create({
      destination: 1,
      geo: 1,
      speciality: 1,
      familiarity: 1,
    });
    // Match parfait sur tous les axes × poids normalisés (sum = 1) = 1.0
    expect(c.toScoreBrut(DEFAULT_WEIGHTS).value).toBeCloseTo(1, 6);
  });

  it('toScoreBrut pondère correctement les axes', () => {
    const c = ScoreComponents.create({
      destination: 1,
      geo: 0,
      speciality: 0,
      familiarity: 0,
    });
    // Seulement destination match = 0.35 (poids destination)
    expect(c.toScoreBrut(DEFAULT_WEIGHTS).value).toBeCloseTo(0.35, 6);
  });

  it('toScoreBrut est déterministe (SC-002)', () => {
    const c = ScoreComponents.create({
      destination: 0.7,
      geo: 0.4,
      speciality: 0.9,
      familiarity: 0.2,
    });
    const s1 = c.toScoreBrut(DEFAULT_WEIGHTS).value;
    const s2 = c.toScoreBrut(DEFAULT_WEIGHTS).value;
    expect(s1).toBe(s2);
  });

  it('toScoreBrut retourne un Score ∈ [0, 1]', () => {
    const c = ScoreComponents.create({
      destination: 0.5,
      geo: 0.5,
      speciality: 0.5,
      familiarity: 0.5,
    });
    const s = c.toScoreBrut(DEFAULT_WEIGHTS).value;
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThanOrEqual(1);
  });
});
