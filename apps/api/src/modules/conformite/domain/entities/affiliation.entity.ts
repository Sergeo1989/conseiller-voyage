// T039 — Entité Affiliation.
// Déclaration faite par le conseiller — nom d'agence + numéro de permis
// + preuve scannée. Clarification Q1 : saisie texte libre, pas d'entité
// Agence partagée ; le numéro de permis est la clé canonique de
// regroupement pour la cascade FR-015.
// Cf. data-model.md *Affiliation*.

import type { AffiliationId, ConseillerComplianceId } from '@cv/shared/conformite';
import type { Province } from '../value-objects/province.vo';
import type { SubmissionDecision } from './certificat.entity';

export const AFFILIATION_INACTIVATION_REASONS = [
  'conseiller',
  'permit_revocation',
  'admin',
] as const;
export type AffiliationInactivationReason = (typeof AFFILIATION_INACTIVATION_REASONS)[number];

export interface Affiliation {
  readonly id: AffiliationId;
  readonly conseillerComplianceId: ConseillerComplianceId;
  readonly agencyName: string;
  readonly agencyPermitNumber: string; // valeur normalisée de PermitNumber.value
  readonly agencyProvince: Province;
  readonly proofObjectKey: string;
  readonly submittedAt: Date;
  readonly decision: SubmissionDecision;
  readonly decisionAt: Date | null;
  readonly decisionByAdminId: string | null;
  readonly refusalReason: string | null;
  readonly role: string | null;
  readonly activeSince: Date | null;
  readonly activeUntil: Date | null;
  readonly inactivatedBy: AffiliationInactivationReason | null;
  readonly inactivatedAt: Date | null;
}
