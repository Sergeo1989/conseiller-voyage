// T025 — Port MatchingAuditWriter (append-only, FR-008 + FR-020).
//
// L'adapter Prisma (T056 Phase 3) insert dans matching_audit_entries
// dans la même transaction que la création du MR (cohérence atomique).
//
// Garantie cruciale : `payload` ne doit JAMAIS contenir de PII voyageur
// (email/téléphone/prénom). Le contrat type le force par l'absence de
// ces champs ; les CLI scan PII (T093b) vérifient en CI.

import type { MatchingAuditEntryId, MatchingResultId } from '@cv/shared/matching';

export type MatchingAuditEventType =
  | 'matching.computed'
  | 'matching.empty'
  | 'matching.partial'
  | 'matching.replay_ignored'
  | 'matching.recomputed'
  | 'matching.all_matches_revoked_detected'
  | 'matching.conseiller_address_missing';

/**
 * Payload tech audit — strictement SANS PII voyageur (FR-020).
 * Les seuls IDs autorisés sont briefId + matchingResultId + conseillerId
 * (qui sont des FK techniques, pas de la PII directe).
 */
export interface MatchingAuditPayload {
  readonly candidatesCount?: number;
  readonly verifiedCount?: number;
  readonly languageFilteredCount?: number;
  readonly addressMissingCount?: number;
  readonly durationMs?: number;
  readonly algorithmVersion?: string;
  readonly boostApplied?: boolean;
  readonly previousMatchingResultId?: MatchingResultId;
  readonly adminActorId?: string; // UUID admin pour matching.recomputed
  readonly reason?: string; // admin reason pour matching.recomputed (≤ 500 chars)
  readonly revokedConseillerCount?: 1 | 2 | 3; // pour matching.all_matches_revoked_detected
  readonly conseillerIdMissingAddress?: string; // pour matching.conseiller_address_missing
}

export interface MatchingAuditEntryInput {
  readonly id: MatchingAuditEntryId;
  readonly briefId: string | null;
  readonly matchingResultId: MatchingResultId | null;
  readonly eventType: MatchingAuditEventType;
  readonly payload: MatchingAuditPayload;
  readonly idempotencyKey: string | null;
  readonly correlationId: string | null;
  readonly occurredAt: Date;
}

export interface MatchingAuditWriter {
  append(entry: MatchingAuditEntryInput): Promise<void>;
}

export const MATCHING_AUDIT_WRITER = Symbol.for('MatchingAuditWriter');
