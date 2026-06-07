// T001 — Contrat public `MatchingLeadQueryPort` (feature 012).
//
// Interface de lecture seule exposée par le module matching (via
// `@cv/shared/matching`), consommée par 014 (tableau de bord conseiller) et
// 015 (espace voyageur — vue restreinte). Aucune transition n'est déclenchée
// par ce port (contrairement à `GET /leads/:id` qui auto-`vu`).
//
// Cf. specs/012-lead-notifications-state-machine/contracts/lead-query.port.md.

import type { MatchingResultId } from './branded-ids';
import type { LeadState, LeadTransitionActor } from './lead-state';

// ---------------------------------------------------------------------------
// Token DI — pattern hérité @cv/shared/matching.MATCHING_QUERY_PORT
// ---------------------------------------------------------------------------

export const MATCHING_LEAD_QUERY_PORT = Symbol.for('MatchingLeadQueryPort');

// ---------------------------------------------------------------------------
// Sous-vues
// ---------------------------------------------------------------------------

/** Une entrée d'historique de transition — sans PII (ids + états seulement). */
export interface LeadTransitionView {
  readonly fromState: LeadState | null;
  readonly toState: LeadState;
  readonly actor: LeadTransitionActor;
  readonly occurredAt: Date;
}

/**
 * Détail d'un lead pour un client autorisé (014). Sans PII voyageur.
 * `briefId` est null si le brief a été anonymisé (Loi 25).
 */
export interface LeadDetailView {
  readonly id: string;
  readonly matchingResultId: MatchingResultId;
  readonly position: 1 | 2 | 3;
  readonly conseillerId: string;
  readonly briefId: string | null;
  readonly currentState: LeadState;
  readonly scoreFinal: number | null;
  readonly boosted: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly history: ReadonlyArray<LeadTransitionView>;
}

/** Liste paginée des leads d'un conseiller (dashboard 014). */
export interface LeadAdminListView {
  readonly items: ReadonlyArray<LeadDetailView>;
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
}

/**
 * Vue voyageur agrégée d'un brief (015) : statuts des conseillers du top 3
 * sans PII conseiller superflue. `null` si le brief est anonymisé.
 */
export interface BriefLeadsSummaryEntry {
  readonly position: 1 | 2 | 3;
  readonly currentState: LeadState;
  readonly conseillerVerifie: boolean;
}

export interface BriefLeadsSummaryView {
  readonly briefId: string;
  readonly leads: ReadonlyArray<BriefLeadsSummaryEntry>;
}

// ---------------------------------------------------------------------------
// Filtre de liste
// ---------------------------------------------------------------------------

export interface ListLeadsForConseillerFilter {
  readonly state?: LeadState;
  readonly page: number;
  readonly pageSize: number;
}

// ---------------------------------------------------------------------------
// Port public (lecture seule)
// ---------------------------------------------------------------------------

export interface MatchingLeadQueryPort {
  /**
   * Leads d'un conseiller (dashboard 014). Re-filtrage `verified` appliqué
   * côté lecture (un conseiller non vérifié au moment de la lecture est
   * filtré selon la politique anti-marketplace).
   */
  listLeadsForConseiller(
    conseillerId: string,
    filter: ListLeadsForConseillerFilter,
  ): Promise<LeadAdminListView>;

  /**
   * Détail d'un lead sans déclencher de transition (lecture pure pour clients).
   * `null` si le lead n'existe pas.
   */
  getLeadById(leadId: string): Promise<LeadDetailView | null>;

  /**
   * Vue voyageur agrégée d'un brief (015). `conseillerVerifie` résolu
   * dynamiquement (`ConformiteQueryPort`) au moment de la lecture.
   * `null` si le brief est anonymisé.
   */
  getBriefLeadsSummary(briefId: string): Promise<BriefLeadsSummaryView | null>;
}
