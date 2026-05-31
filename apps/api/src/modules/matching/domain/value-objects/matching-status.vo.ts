// T039 [TDD GREEN] — Value Object MatchingStatus.
// Dérivation pure du matchedCount (0 → empty, 1-2 → partial, 3 → ok).
// Cohérence forcée par CHECK constraint DB (matching_results) + dérivation
// pure côté domain. Plafond 3 strict (SC-003 invariant testé).

export type MatchingStatus = 'ok' | 'partial' | 'empty';

const PLAFOND_MAX_MATCHES = 3; // SC-003 invariant

export function fromMatchedCount(matchedCount: number): MatchingStatus {
  if (!Number.isInteger(matchedCount)) {
    throw new Error(`matchedCount doit être un entier : ${matchedCount}`);
  }
  if (matchedCount < 0) {
    throw new Error(`matchedCount invalide : ${matchedCount} (attendu ≥ 0)`);
  }
  if (matchedCount > PLAFOND_MAX_MATCHES) {
    throw new Error(
      `matchedCount invalide : ${matchedCount} (plafond ${PLAFOND_MAX_MATCHES} strict — SC-003)`,
    );
  }
  if (matchedCount === 0) return 'empty';
  if (matchedCount === PLAFOND_MAX_MATCHES) return 'ok';
  return 'partial';
}

export function isOk(status: MatchingStatus): boolean {
  return status === 'ok';
}

export function isPartial(status: MatchingStatus): boolean {
  return status === 'partial';
}

export function isEmpty(status: MatchingStatus): boolean {
  return status === 'empty';
}
