// T035 [TDD GREEN] — Value Object ScoreComponents.
// Record des 4 axes scorés (destination, geo, speciality, familiarity).
// Chaque composante ∈ [0, 1]. toScoreBrut(weights) calcule la combinaison
// pondérée (fonction pure, déterministe SC-002).

import { Score } from './score.vo';
import type { WeightsConfig } from './weights-config.vo';

export interface ScoreComponentsInput {
  readonly destination: number;
  readonly geo: number;
  readonly speciality: number;
  readonly familiarity: number;
}

export class ScoreComponents {
  private constructor(
    public readonly destination: number,
    public readonly geo: number,
    public readonly speciality: number,
    public readonly familiarity: number,
  ) {}

  static create(input: ScoreComponentsInput): ScoreComponents {
    validateComponentValue('destination', input.destination);
    validateComponentValue('geo', input.geo);
    validateComponentValue('speciality', input.speciality);
    validateComponentValue('familiarity', input.familiarity);
    return new ScoreComponents(input.destination, input.geo, input.speciality, input.familiarity);
  }

  /**
   * Combine les 4 composantes via la pondération injectée (WeightsConfig).
   * Retourne un Score ∈ [0, 1] (la pondération sum = 1.0 garantit la borne).
   * Pure : déterministe pour les mêmes entrées (SC-002).
   */
  toScoreBrut(weights: WeightsConfig): Score {
    const brut =
      this.destination * weights.destination +
      this.geo * weights.geo +
      this.speciality * weights.speciality +
      this.familiarity * weights.familiarity;
    return Score.fromNumber(brut);
  }
}

function validateComponentValue(name: string, value: number): void {
  if (Number.isNaN(value) || !Number.isFinite(value)) {
    throw new Error(`ScoreComponents.${name} invalide : ${value} (NaN ou Infinity)`);
  }
  if (value < 0 || value > 1) {
    throw new Error(`ScoreComponents.${name} invalide : ${value} (attendu ∈ [0, 1])`);
  }
}
