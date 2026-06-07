// T012 — Port LeadReader (lecture leads, feature 012).
//
// Sert les use cases de transition (findById), le dashboard conseiller
// (listByConseiller), la garde d'unicité de lead actif (findActiveByBrief...)
// et le sweep de réconciliation (findActiveMatchingResultsWithoutLead).

import type { LeadState, LeadTransitionActor } from '@cv/shared/matching';

/** Projection d'une transition (sans PII). */
export interface LeadTransitionRecord {
  readonly id: string;
  readonly fromState: LeadState | null;
  readonly toState: LeadState;
  readonly actor: LeadTransitionActor;
  readonly actorId: string | null;
  readonly occurredAt: Date;
}

/** Entité lead lue (sans PII voyageur). */
export interface LeadRecord {
  readonly id: string;
  readonly matchingResultId: string;
  readonly matchingResultEntryPosition: 1 | 2 | 3;
  readonly conseillerId: string;
  readonly briefId: string | null;
  readonly currentState: LeadState;
  readonly scoreFinal: number | null;
  readonly boosted: boolean;
  readonly closeReason: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface LeadWithHistory extends LeadRecord {
  readonly history: ReadonlyArray<LeadTransitionRecord>;
}

export interface ListLeadsByConseillerFilter {
  readonly conseillerId: string;
  readonly state?: LeadState;
  readonly page: number;
  readonly pageSize: number;
}

export interface ListLeadsByConseillerResult {
  readonly items: ReadonlyArray<LeadWithHistory>;
  readonly total: number;
}

/** Référence légère d'un MatchingResult actif sans lead (sweep). */
export interface MatchingResultWithoutLead {
  readonly matchingResultId: string;
  readonly briefId: string;
}

export interface LeadReader {
  findById(leadId: string): Promise<LeadWithHistory | null>;

  listByConseiller(filter: ListLeadsByConseillerFilter): Promise<ListLeadsByConseillerResult>;

  /** Lead actif (non terminal) d'un conseiller pour un brief (garde SC-008). */
  findActiveByBriefAndConseiller(briefId: string, conseillerId: string): Promise<LeadRecord | null>;

  /**
   * MatchingResults actifs (`ok`/`partial`, non superseded) sans lead
   * correspondant — alimente le sweep de réconciliation (mode dégradé bus HS).
   */
  findActiveMatchingResultsWithoutLead(
    limit: number,
  ): Promise<ReadonlyArray<MatchingResultWithoutLead>>;
}

export const LEAD_READER = Symbol.for('LeadReader');
