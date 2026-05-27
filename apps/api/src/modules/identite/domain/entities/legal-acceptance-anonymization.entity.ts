// Entité LegalAcceptanceAnonymization (T028) — matérialise
// l'anonymisation Loi 25 d'une LegalAcceptance sans modifier la row
// originale (qui reste immutable, cf. ADR-0008).
// Cf. specs/004-mentions-legales/data-model.md *LegalAcceptanceAnonymization*.

import type { LegalAcceptanceAnonymizationId, LegalAcceptanceId } from '@cv/legal';

export interface LegalAcceptanceAnonymization {
  readonly id: LegalAcceptanceAnonymizationId;
  /** FK unique vers LegalAcceptance.id — une seule anonymisation par acceptance */
  readonly acceptanceId: LegalAcceptanceId;
  /** SHA-256(subjectId || project_salt) — 64 chars hex */
  readonly subjectIdHash: string;
  /** IP masquée : IPv4 `a.0.0.0` ou IPv6 préfixe /48 */
  readonly ipAddressMasked: string;
  /** Famille de navigateur uniquement (Firefox, Chrome, unknown, ...) */
  readonly userAgentFamily: string;
  readonly anonymizedAt: Date;
  /** Version du salt utilisée (cf. ADR-0008 plan de rotation) */
  readonly anonymizationSaltVersion: number;
}

/**
 * Vue assemblée d'une LegalAcceptance avec son anonymisation potentielle
 * (LEFT JOIN). Utilisée en lecture pour respecter l'invariant : zéro
 * accès direct au subjectId brut si la row est anonymisée.
 */
export interface LegalAcceptanceWithAnonymization {
  readonly acceptance: import('./legal-acceptance.entity').LegalAcceptance;
  readonly anonymization: LegalAcceptanceAnonymization | null;
  readonly isAnonymized: boolean;
}
