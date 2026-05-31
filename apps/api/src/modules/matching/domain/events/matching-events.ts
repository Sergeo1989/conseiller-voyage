// T050 [GREEN] — Types d'événements domain matching.
// 4 events distincts (Q5 clarify) émis par PerformMatchingUseCase
// (Phase 3 T053) et TriggerRematchUseCase (Phase 5 T075) +
// AllMatchesRevokedDetector (Phase 5 T077).
//
// Ces types sont consommés par les use cases pour structurer la publication
// outbox. Les schemas Zod runtime correspondants vivent dans
// @cv/shared/matching/schemas.

import type { MatchingResultId } from '@cv/shared/matching';

export interface BriefMatchedEvent {
  readonly type: 'voyageur.brief.matched';
  readonly matchingResultId: MatchingResultId;
  readonly briefId: string;
  readonly algorithmVersion: string;
  readonly computedAt: Date;
  readonly entries: ReadonlyArray<{
    readonly position: 1 | 2 | 3;
    readonly conseillerId: string;
    readonly scoreFinal: number;
    readonly boosted: boolean;
  }>;
  readonly boostApplied: boolean;
}

export interface BriefPartiallyMatchedEvent {
  readonly type: 'voyageur.brief.partially_matched';
  readonly matchingResultId: MatchingResultId;
  readonly briefId: string;
  readonly matchedCount: 1 | 2;
  readonly algorithmVersion: string;
  readonly computedAt: Date;
  readonly entries: ReadonlyArray<{
    readonly position: 1 | 2;
    readonly conseillerId: string;
    readonly scoreFinal: number;
    readonly boosted: boolean;
  }>;
  readonly boostApplied: boolean;
  readonly reason:
    | 'insufficient_verified_conseillers'
    | 'language_filter_excluded_too_many'
    | 'destination_no_specialist'
    | 'multiple_factors';
}

export interface BriefUnmatchedEvent {
  readonly type: 'voyageur.brief.unmatched';
  readonly matchingResultId: MatchingResultId;
  readonly briefId: string;
  readonly algorithmVersion: string;
  readonly computedAt: Date;
  readonly reason:
    | 'no_verified_conseillers_at_all'
    | 'no_conseiller_speaks_requested_language'
    | 'no_conseiller_covers_destination'
    | 'multiple_factors';
  readonly candidatesEvaluatedCount: number;
}

/** Émis par DetectAllMatchesRevokedScheduler (T077 Phase 5). */
export interface AllMatchesRevokedEvent {
  readonly type: 'voyageur.brief.all_matches_revoked';
  readonly matchingResultId: MatchingResultId;
  readonly briefId: string;
  readonly algorithmVersion: string;
  readonly originalComputedAt: Date;
  readonly revokedAt: Date;
  readonly revokedConseillerIds: ReadonlyArray<string>;
}

/** Discriminated union pour pattern matching exhaustif côté consumers. */
export type MatchingDomainEvent =
  | BriefMatchedEvent
  | BriefPartiallyMatchedEvent
  | BriefUnmatchedEvent
  | AllMatchesRevokedEvent;
