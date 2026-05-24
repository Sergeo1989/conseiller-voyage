// T038 — Entité Certificat.
// Document provincial CCV (QC) ou TICO (ON) téléversé par le conseiller.
// Cf. data-model.md *Certificat*.

import type { CertificatId, ConseillerComplianceId } from '@cv/shared/conformite';
import type { Province } from '../value-objects/province.vo';

export const SUBMISSION_DECISIONS = ['pending', 'approved', 'refused'] as const;
export type SubmissionDecision = (typeof SUBMISSION_DECISIONS)[number];

export interface Certificat {
  readonly id: CertificatId;
  readonly conseillerComplianceId: ConseillerComplianceId;
  readonly province: Province;
  readonly certificateNumber: string;
  readonly issuedAt: Date;
  readonly expiresAt: Date;
  readonly documentObjectKey: string;
  readonly submittedAt: Date;
  readonly decision: SubmissionDecision;
  readonly decisionAt: Date | null;
  readonly decisionByAdminId: string | null;
  readonly refusalReason: string | null;
  readonly supersededById: CertificatId | null;
}
