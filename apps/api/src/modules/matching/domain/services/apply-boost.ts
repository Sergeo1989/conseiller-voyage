// T066 [TDD GREEN] — Service applyBoost (US2 P2).
//
// Fonction pure : score brut → score final selon cookie cv_suggested (FR-011).
//
// Règles :
//   - suggestedConseillerId === conseillerId : multiplier scoreBrut × factorMax
//     (cap dur strict ≤ 1.10 — Score.multiplyByFactor garantit déjà ce cap)
//   - sinon : no-op (scoreFinal = scoreBrut, boosted = false)
//
// L'invariant « le boost ne rend pas un non-éligible éligible » est tenu par
// construction : applyBoost s'applique aux conseillers déjà filtrés
// (verified + langue + adresse) en amont par le use case.

import type { Score } from '../value-objects/score.vo';

export interface ApplyBoostInput {
  readonly scoreBrut: Score;
  readonly conseillerId: string;
  readonly suggestedConseillerId: string | null;
  readonly factorMax: number;
}

export interface ApplyBoostResult {
  readonly scoreFinal: Score;
  readonly boosted: boolean;
}

// Plafond strict (FR-011/FR-012) — peut être plus bas si factorMax demande
// moins, mais jamais au-delà.
const ABSOLUTE_BOOST_CAP = 1.1;

export function applyBoost(input: ApplyBoostInput): ApplyBoostResult {
  // No-op si pas de suggestedConseillerId OU si mismatch.
  if (input.suggestedConseillerId === null || input.suggestedConseillerId !== input.conseillerId) {
    return { scoreFinal: input.scoreBrut, boosted: false };
  }
  // Boost appliqué — cap au minimum entre factorMax demandé et le plafond
  // absolu 1.10 (défense en profondeur même si factorMax > 1.10).
  const effectiveFactor = Math.min(input.factorMax, ABSOLUTE_BOOST_CAP);
  // Score.multiplyByFactor refuse factor < 1, donc on garantit ≥ 1 ici.
  const safeFactor = Math.max(effectiveFactor, 1);
  return {
    scoreFinal: input.scoreBrut.multiplyByFactor(safeFactor),
    boosted: safeFactor > 1,
  };
}
