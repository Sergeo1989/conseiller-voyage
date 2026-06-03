// T033 [TDD GREEN] — Value Object Score.
// Decimal immutable ∈ [0, 1.1]. 0 = aucun match, 1 = match parfait,
// 1.1 = match parfait boosté +10% (FR-011 plafond strict).
//
// Comparison à 1e-6 près pour SC-002 (déterminisme).
// Fonction pure — aucun I/O, aucune horloge, aucun aléa (Principe VI).

const SCORE_MIN = 0;
const SCORE_MAX = 1.1; // plafond strict avec boost ≤ +10% (FR-011)
const SCORE_EQUALITY_TOLERANCE = 1e-6;

export class Score {
  private constructor(public readonly value: number) {}

  static zero(): Score {
    return new Score(0);
  }

  static one(): Score {
    return new Score(1);
  }

  static fromNumber(value: number): Score {
    if (Number.isNaN(value) || !Number.isFinite(value)) {
      throw new Error(`Score invalide : ${value} (NaN ou Infinity)`);
    }
    if (value < SCORE_MIN || value > SCORE_MAX) {
      throw new Error(`Score invalide : ${value} (attendu ∈ [${SCORE_MIN}, ${SCORE_MAX}])`);
    }
    return new Score(value);
  }

  /**
   * Applique un facteur multiplicatif (boost cookie cv_suggested FR-011).
   * Cap dur à 1.1. Refuse facteur < 1 (boost ne descend jamais).
   */
  multiplyByFactor(factor: number): Score {
    if (factor < 1) {
      throw new Error(`Factor invalide : ${factor} (boost ne descend jamais, attendu ≥ 1)`);
    }
    const product = this.value * factor;
    return new Score(Math.min(product, SCORE_MAX));
  }

  /** Comparison à 1e-6 près (SC-002 déterminisme). */
  equals(other: Score): boolean {
    return Math.abs(this.value - other.value) < SCORE_EQUALITY_TOLERANCE;
  }

  isGreaterThan(other: Score): boolean {
    return this.value > other.value + SCORE_EQUALITY_TOLERANCE;
  }
}
