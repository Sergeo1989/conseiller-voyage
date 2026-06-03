// T040 [TDD RED] — Tests WeightsConfig VO.
// WeightsConfig contient les poids des 4 axes scorés. Invariant strict :
// destination + geo + speciality + familiarity = 1.0 ± 1e-6. Aligne sur
// le superRefine Zod de env.ts (T003) — défense en profondeur.

import { describe, expect, it } from 'vitest';
import { WeightsConfig } from '../weights-config.vo';

describe('WeightsConfig VO', () => {
  it('create accepte 4 poids dont sum = 1.0', () => {
    const w = WeightsConfig.create({
      destination: 0.35,
      geo: 0.25,
      speciality: 0.25,
      familiarity: 0.15,
    });
    expect(w.destination).toBe(0.35);
    expect(w.geo).toBe(0.25);
    expect(w.speciality).toBe(0.25);
    expect(w.familiarity).toBe(0.15);
  });

  it('create accepte tolérance flottante (1e-6)', () => {
    expect(() =>
      WeightsConfig.create({
        destination: 0.35 + 5e-7,
        geo: 0.25,
        speciality: 0.25,
        familiarity: 0.15,
      }),
    ).not.toThrow();
  });

  it('create refuse sum > 1', () => {
    expect(() =>
      WeightsConfig.create({
        destination: 0.5,
        geo: 0.25,
        speciality: 0.25,
        familiarity: 0.15,
      }),
    ).toThrow(/sum/i);
  });

  it('create refuse sum < 1', () => {
    expect(() =>
      WeightsConfig.create({
        destination: 0.2,
        geo: 0.25,
        speciality: 0.25,
        familiarity: 0.15,
      }),
    ).toThrow(/sum/i);
  });

  it('create refuse poids négatif', () => {
    expect(() =>
      WeightsConfig.create({
        destination: 1.1,
        geo: -0.1,
        speciality: 0,
        familiarity: 0,
      }),
    ).toThrow();
  });

  it('DEFAULT_WEIGHTS_V1 expose les valeurs ADR-0020', () => {
    expect(WeightsConfig.DEFAULT_WEIGHTS_V1.destination).toBe(0.35);
    expect(WeightsConfig.DEFAULT_WEIGHTS_V1.geo).toBe(0.25);
    expect(WeightsConfig.DEFAULT_WEIGHTS_V1.speciality).toBe(0.25);
    expect(WeightsConfig.DEFAULT_WEIGHTS_V1.familiarity).toBe(0.15);
  });
});
