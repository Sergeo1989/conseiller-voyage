// T018 — Contrat public du module matching (feature 011).
//
// Interface `MatchingQueryPort` exposée par le module matching, consommée
// par 012 notifications (futur), 015 espace voyageur (futur), et l'extension
// US5 du dashboard admin de 008. Conforme Principe V (passage cross-module
// uniquement par interface publique).
//
// Cf. specs/008-matching-scoring/contracts/matching-query.port.md.

import type { MatchingResultId } from './branded-ids';

// ---------------------------------------------------------------------------
// Token DI — pattern hérité @cv/shared/conformite.CONFORMITE_QUERY_PORT
// ---------------------------------------------------------------------------

export const MATCHING_QUERY_PORT = Symbol.for('MATCHING_QUERY_PORT');

// ---------------------------------------------------------------------------
// Vue voyageur (filtre dynamique verified appliqué) — FR-015
// ---------------------------------------------------------------------------

export interface MatchingResultPublicEntry {
  readonly position: 1 | 2 | 3;
  readonly conseillerId: string; // brand côté consommateur (ConseillerId)
  // scoreBrut / scoreFinal / scoreComponents JAMAIS exposés au voyageur
  // (signal interne — pondération business sensitive)
}

export interface MatchingResultPublicView {
  readonly matchingResultId: MatchingResultId;
  readonly briefId: string; // brand côté consommateur (VoyageurBriefId)
  readonly status: 'ok' | 'partial' | 'empty';
  readonly matchedCount: 0 | 1 | 2 | 3;
  readonly entries: ReadonlyArray<MatchingResultPublicEntry>;
  readonly computedAt: Date;
  readonly algorithmVersion: string;
}

// ---------------------------------------------------------------------------
// Vue admin (sans filtre dynamique — état historique exact)
// ---------------------------------------------------------------------------

export type ConseillerCurrentVerifiedStatus = 'verified' | 'revoked' | 'expired' | 'unknown';

export interface MatchingResultAdminEntry {
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
  readonly currentVerifiedStatus: ConseillerCurrentVerifiedStatus;
}

export interface MatchingResultAdminView {
  readonly matchingResultId: MatchingResultId;
  readonly briefId: string;
  readonly status: 'ok' | 'partial' | 'empty';
  readonly matchedCount: 0 | 1 | 2 | 3;
  readonly entries: ReadonlyArray<MatchingResultAdminEntry>;
  readonly computedAt: Date;
  readonly algorithmVersion: string;
  readonly supersededAt: Date | null;
  readonly supersededByMatchingResultId: MatchingResultId | null;
  readonly boostApplied: boolean;
  readonly suggestedConseillerId: string | null;
}

// ---------------------------------------------------------------------------
// Summary file admin "briefs all_matches_revoked"
// ---------------------------------------------------------------------------

export interface BriefRevocationSummary {
  readonly briefId: string;
  readonly matchingResultId: MatchingResultId;
  readonly computedAt: Date;
  readonly lastRevocationAt: Date;
  readonly revokedConseillerCount: 1 | 2 | 3;
}

// ---------------------------------------------------------------------------
// Port public
// ---------------------------------------------------------------------------

export interface MatchingQueryPort {
  /**
   * Lit le MatchingResult actif (non superseded) pour un brief donné.
   * Filtre dynamiquement les conseillers ayant perdu leur statut verified
   * après le calcul (FR-015). Le MatchingResult original reste intact.
   *
   * @returns null si aucun matching pour ce brief
   *          (status pending_verification ou brief anonymisé Loi 25)
   */
  getByBriefIdForVoyageur(briefId: string): Promise<MatchingResultPublicView | null>;

  /**
   * Vue admin SANS filtre dynamique — historique exact + statut courant
   * de chaque conseiller (currentVerifiedStatus).
   */
  getByBriefIdForAdmin(briefId: string): Promise<MatchingResultAdminView | null>;

  /**
   * Liste les briefs dont les 3 conseillers du top 3 sont tous révoqués
   * (cas FR-016, alimente la file admin re-matching).
   *
   * @param sinceMs — ne lister que les MR dont la dernière révocation est postérieure
   */
  listBriefsWithAllMatchesRevoked(sinceMs: number): Promise<ReadonlyArray<BriefRevocationSummary>>;
}
