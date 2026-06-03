// T049 [GREEN] — Entité MatchingResultEntry.
// Une ligne du top 3. Invariants enforcés domain + DB :
//   - position ∈ {1, 2, 3} (CHECK + UNIQUE composé)
//   - scoreBrut ∈ [0, 1], scoreFinal ∈ [0, 1.1]
//   - scoreFinal ≥ scoreBrut (boost ne descend jamais, FR-011/FR-012)
//   - scoreFinal ≤ scoreBrut × 1.10 (cap +10% strict)
//   - boosted=true ⇒ scoreFinal > scoreBrut

import type { MatchingResultEntryId, MatchingResultId } from '@cv/shared/matching';
import type { Score } from '../value-objects/score.vo';

const BOOST_FACTOR_MAX = 1.1; // FR-011

export interface MatchingResultEntryProps {
  readonly id: MatchingResultEntryId;
  readonly matchingResultId: MatchingResultId;
  readonly position: 1 | 2 | 3;
  readonly conseillerId: string;
  readonly scoreBrut: Score;
  readonly scoreFinal: Score;
  readonly scoreComponents: Readonly<{
    destination: number;
    geo: number;
    speciality: number;
    familiarity: number;
  }>;
  readonly boosted: boolean;
}

export class MatchingResultEntry {
  private constructor(public readonly props: MatchingResultEntryProps) {}

  static create(props: MatchingResultEntryProps): MatchingResultEntry {
    const brut = props.scoreBrut.value;
    const final = props.scoreFinal.value;
    // Invariant : scoreFinal >= scoreBrut (boost ne descend jamais)
    if (final < brut - 1e-6) {
      throw new Error(
        `MatchingResultEntry invariant : scoreFinal (${final}) < scoreBrut (${brut})`,
      );
    }
    // Invariant : scoreFinal <= scoreBrut * 1.10 + tolérance (cap +10%)
    if (final > brut * BOOST_FACTOR_MAX + 1e-6) {
      throw new Error(
        `MatchingResultEntry invariant : scoreFinal (${final}) > scoreBrut (${brut}) × ${BOOST_FACTOR_MAX}`,
      );
    }
    // Invariant : boosted=true ⇒ scoreFinal > scoreBrut
    if (props.boosted && final <= brut + 1e-6) {
      throw new Error(
        `MatchingResultEntry invariant : boosted=true mais scoreFinal (${final}) ≤ scoreBrut (${brut})`,
      );
    }
    return new MatchingResultEntry(props);
  }
}
