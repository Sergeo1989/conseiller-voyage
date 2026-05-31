// T048 [GREEN] — Entité MatchingResult.
// Représente le calcul du top 3 pour un brief, à un instant donné.
// 1 entrée active (supersededAt IS NULL) par briefId via UNIQUE INDEX
// partiel — idempotence FR-004.

import type { MatchingResultId } from '@cv/shared/matching';
import type { MatchingStatus } from '../value-objects/matching-status.vo';

export interface MatchingResultProps {
  readonly id: MatchingResultId;
  readonly briefId: string | null; // null post-anonymisation Loi 25
  readonly status: MatchingStatus;
  readonly matchedCount: 0 | 1 | 2 | 3;
  readonly algorithmVersion: string;
  readonly suggestedConseillerId: string | null;
  readonly boostApplied: boolean;
  readonly computedAt: Date;
  readonly supersededAt: Date | null;
  readonly supersededByMatchingResultId: MatchingResultId | null;
}

export class MatchingResult {
  private constructor(public readonly props: MatchingResultProps) {}

  static create(props: MatchingResultProps): MatchingResult {
    // Invariant : status ⇔ matchedCount cohérents (redondant avec CHECK DB
    // mais vérifié domain pour catch précoce)
    validateStatusMatchedCountConsistency(props.status, props.matchedCount);
    // Invariant : supersededAt + supersededByMatchingResultId nullables ensemble
    if ((props.supersededAt === null) !== (props.supersededByMatchingResultId === null)) {
      throw new Error(
        'MatchingResult invariant : supersededAt et supersededByMatchingResultId DOIVENT être null ensemble OU non-null ensemble',
      );
    }
    // Si briefId est null, le MR est anonymisé Loi 25 — pas d'autre invariant
    return new MatchingResult(props);
  }

  /** Marque le MR comme superseded par un nouveau (re-matching admin FR-016). */
  markSuperseded(newMatchingResultId: MatchingResultId, supersededAt: Date): MatchingResult {
    if (this.props.supersededAt !== null) {
      throw new Error(`MatchingResult ${this.props.id} déjà superseded`);
    }
    return MatchingResult.create({
      ...this.props,
      supersededAt,
      supersededByMatchingResultId: newMatchingResultId,
    });
  }

  isActive(): boolean {
    return this.props.supersededAt === null;
  }

  isAnonymised(): boolean {
    return this.props.briefId === null;
  }
}

function validateStatusMatchedCountConsistency(status: MatchingStatus, matchedCount: number): void {
  if (status === 'empty' && matchedCount !== 0) {
    throw new Error('MatchingResult : status=empty incohérent avec matchedCount > 0');
  }
  if (status === 'partial' && (matchedCount < 1 || matchedCount > 2)) {
    throw new Error('MatchingResult : status=partial incohérent avec matchedCount hors [1, 2]');
  }
  if (status === 'ok' && matchedCount !== 3) {
    throw new Error('MatchingResult : status=ok incohérent avec matchedCount != 3');
  }
}
