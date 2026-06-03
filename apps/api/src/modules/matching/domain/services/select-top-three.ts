// T047 [TDD GREEN] — Service selectTopThree.
// Tri décroissant par scoreFinal + plafond 3 STRICT (SC-003).
// Tie-breaking par conseillerId alphabétique pour SC-002 (déterminisme).
// Dérive status (ok/partial/empty) et matchedCount depuis le résultat.

import { type MatchingStatus, fromMatchedCount } from '../value-objects/matching-status.vo';
import type { Score } from '../value-objects/score.vo';

export interface ScoredConseiller {
  readonly conseillerId: string;
  readonly scoreBrut: Score;
  readonly scoreFinal: Score;
  readonly components: Readonly<{
    destination: number;
    geo: number;
    speciality: number;
    familiarity: number;
  }>;
  readonly boosted: boolean;
}

export interface TopThreeEntry {
  readonly position: 1 | 2 | 3;
  readonly conseillerId: string;
  readonly scoreBrut: Score;
  readonly scoreFinal: Score;
  readonly components: ScoredConseiller['components'];
  readonly boosted: boolean;
}

export interface TopThreeResult {
  readonly entries: ReadonlyArray<TopThreeEntry>;
  readonly status: MatchingStatus;
  readonly matchedCount: 0 | 1 | 2 | 3;
}

const PLAFOND_MAX = 3;

export function selectTopThree(candidates: ReadonlyArray<ScoredConseiller>): TopThreeResult {
  // Tri stable :
  //   1. scoreFinal décroissant (primaire)
  //   2. conseillerId alphabétique croissant (tie-break, SC-002 déterminisme)
  const sorted = [...candidates].sort((a, b) => {
    if (a.scoreFinal.isGreaterThan(b.scoreFinal)) return -1;
    if (b.scoreFinal.isGreaterThan(a.scoreFinal)) return 1;
    return a.conseillerId.localeCompare(b.conseillerId);
  });

  const top = sorted.slice(0, PLAFOND_MAX);
  const entries: ReadonlyArray<TopThreeEntry> = top.map((c, i) => ({
    position: (i + 1) as 1 | 2 | 3,
    conseillerId: c.conseillerId,
    scoreBrut: c.scoreBrut,
    scoreFinal: c.scoreFinal,
    components: c.components,
    boosted: c.boosted,
  }));

  const matchedCount = entries.length as 0 | 1 | 2 | 3;
  const status = fromMatchedCount(matchedCount);

  return { entries, status, matchedCount };
}
