// T041 [TDD GREEN] — Value Object WeightsConfig.
// Contient les poids des 4 axes scorés (destination, geo, speciality, familiarity).
// Invariant strict : sum = 1.0 ± 1e-6. Aligne sur le superRefine Zod de env.ts
// (T003) — défense en profondeur (le contrôle env vars + le contrôle domain).
//
// DEFAULT_WEIGHTS_V1 expose les valeurs ADR-0020 (0.35 / 0.25 / 0.25 / 0.15).

const SUM_TOLERANCE = 1e-6;

export interface WeightsConfigInput {
  readonly destination: number;
  readonly geo: number;
  readonly speciality: number;
  readonly familiarity: number;
}

export class WeightsConfig {
  private constructor(
    public readonly destination: number,
    public readonly geo: number,
    public readonly speciality: number,
    public readonly familiarity: number,
  ) {}

  static readonly DEFAULT_WEIGHTS_V1: WeightsConfig = new WeightsConfig(0.35, 0.25, 0.25, 0.15);

  static create(input: WeightsConfigInput): WeightsConfig {
    validateWeight('destination', input.destination);
    validateWeight('geo', input.geo);
    validateWeight('speciality', input.speciality);
    validateWeight('familiarity', input.familiarity);
    const sum = input.destination + input.geo + input.speciality + input.familiarity;
    if (Math.abs(sum - 1) > SUM_TOLERANCE) {
      throw new Error(
        `WeightsConfig invalide : sum = ${sum} (attendu 1.0 ± ${SUM_TOLERANCE}). ` +
          `Pondération courante destination=${input.destination}, geo=${input.geo}, speciality=${input.speciality}, familiarity=${input.familiarity}.`,
      );
    }
    return new WeightsConfig(input.destination, input.geo, input.speciality, input.familiarity);
  }
}

function validateWeight(name: string, value: number): void {
  if (Number.isNaN(value) || !Number.isFinite(value)) {
    throw new Error(`WeightsConfig.${name} invalide : ${value} (NaN ou Infinity)`);
  }
  if (value < 0 || value > 1) {
    throw new Error(`WeightsConfig.${name} invalide : ${value} (attendu ∈ [0, 1])`);
  }
}
