// T024 — Port MatchingResultReader (lecture pour QueryMatchingResultUseCase + scheduler US3).
//
// L'adapter Prisma (T079 Phase 5) résout les requêtes admin / voyageur.
// Pour le scheduler `DetectAllMatchesRevokedScheduler` (T076-T078), on
// lit tous les MR actifs avec status='ok' pour vérifier le statut verified
// courant de chaque conseiller.

import type { MatchingResultId } from '@cv/shared/matching';

export interface MatchingResultEntityEntry {
  readonly position: 1 | 2 | 3;
  readonly conseillerId: string;
  readonly scoreBrut: number;
  readonly scoreFinal: number;
  readonly scoreComponents: Readonly<{
    destination: number;
    geo: number;
    speciality: number;
    familiarity: number;
  }>;
  readonly boosted: boolean;
}

export interface MatchingResultEntity {
  readonly id: MatchingResultId;
  readonly briefId: string | null; // null post-anonymisation Loi 25
  readonly status: 'ok' | 'partial' | 'empty';
  readonly matchedCount: 0 | 1 | 2 | 3;
  readonly algorithmVersion: string;
  readonly suggestedConseillerId: string | null;
  readonly boostApplied: boolean;
  readonly computedAt: Date;
  readonly supersededAt: Date | null;
  readonly supersededByMatchingResultId: MatchingResultId | null;
  readonly entries: ReadonlyArray<MatchingResultEntityEntry>;
}

export interface MatchingResultReader {
  /**
   * Retourne le MR actif (supersededAt IS NULL) pour le brief, OU null si
   * aucun matching ou brief anonymisé.
   */
  findActiveByBriefId(briefId: string): Promise<MatchingResultEntity | null>;

  /**
   * Liste les MR actifs avec status='ok' (top 3 complet) pour scan
   * `DetectAllMatchesRevokedScheduler` (T076 Phase 5).
   *
   * @param limit — taille batch (typique 100)
   */
  findActiveOkResultsForRevocationScan(limit: number): Promise<ReadonlyArray<MatchingResultEntity>>;
}

export const MATCHING_RESULT_READER = Symbol.for('MatchingResultReader');
