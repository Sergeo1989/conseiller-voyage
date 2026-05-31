// T023 — Port MatchingResultWriter (idempotence FR-004).
//
// L'adapter Prisma (T055 Phase 3) gère l'insertion atomique :
//   - INSERT matching_results
//   - INSERT N × matching_result_entries
//   - INSERT matching_outbox_entries (via MatchingOutboxWriter dans la même transaction)
//   - INSERT matching_audit_entries (via MatchingAuditWriter dans la même transaction)
//
// L'idempotence est garantie par l'UNIQUE INDEX partiel
// `idx_matching_results_brief_active` sur (briefId) WHERE supersededAt IS NULL.
// Un replay du même briefId remonte un conflit UNIQUE → l'adapter capture
// l'erreur et retourne `'already_exists'` au use case.

import type { MatchingResultId } from '@cv/shared/matching';

export type MatchingStatusInput = 'ok' | 'partial' | 'empty';

export interface MatchingResultEntryInput {
  readonly position: 1 | 2 | 3;
  readonly conseillerId: string;
  readonly scoreBrut: number; // [0, 1] decimal
  readonly scoreFinal: number; // [0, 1.1] decimal, ≥ scoreBrut
  readonly scoreComponents: Readonly<{
    destination: number;
    geo: number;
    speciality: number;
    familiarity: number;
  }>;
  readonly boosted: boolean;
}

export interface MatchingResultInput {
  readonly id: MatchingResultId;
  readonly briefId: string;
  readonly status: MatchingStatusInput;
  readonly matchedCount: 0 | 1 | 2 | 3;
  readonly algorithmVersion: string; // ex. 'v1.0'
  readonly suggestedConseillerId: string | null;
  readonly boostApplied: boolean;
  readonly computedAt: Date;
}

export type MatchingResultWriteResult =
  | { readonly kind: 'created'; readonly matchingResultId: MatchingResultId }
  | { readonly kind: 'already_exists' }; // replay détecté

export interface MatchingResultWriter {
  /**
   * Insert atomique d'un MatchingResult + ses 0-3 entries.
   * Retourne `already_exists` si le briefId a déjà un MR actif (replay).
   */
  create(
    result: MatchingResultInput,
    entries: ReadonlyArray<MatchingResultEntryInput>,
  ): Promise<MatchingResultWriteResult>;

  /**
   * Marque un MR comme superseded par un nouveau (re-matching admin FR-016).
   * Doit être appelé dans la même transaction que la création du nouveau MR.
   */
  markSuperseded(
    previousMatchingResultId: MatchingResultId,
    newMatchingResultId: MatchingResultId,
    supersededAt: Date,
  ): Promise<void>;
}

export const MATCHING_RESULT_WRITER = Symbol.for('MatchingResultWriter');
