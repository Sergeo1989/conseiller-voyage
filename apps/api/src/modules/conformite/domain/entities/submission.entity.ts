// Entité Submission — regroupe les certificats et affiliations soumis
// par un conseiller en un seul dossier examiné par un admin.
// Cf. data-model.md *Soumission de dossier* + spec FR-003, FR-004.

import type { AdminId, ConseillerComplianceId, SubmissionId } from '@cv/shared/conformite';

export const SUBMISSION_STATUSES = ['pending', 'approved', 'refused'] as const;
export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];

export interface Submission {
  readonly id: SubmissionId;
  readonly conseillerComplianceId: ConseillerComplianceId;
  readonly submittedAt: Date;
  readonly status: SubmissionStatus;
  readonly decidedAt: Date | null;
  readonly decidedByAdminId: AdminId | null;
  readonly decisionReason: string | null; // ≥ 20 chars si refused (FR-004)
}
