// Entité LegalAcceptance (T027) — acceptation horodatée, strictement
// immutable (trigger PostgreSQL bloque UPDATE et DELETE).
// Cf. specs/004-mentions-legales/data-model.md *LegalAcceptance*.

import type { LegalAcceptanceId, LegalAcceptanceSubjectType, LegalDocumentType } from '@cv/legal';

export interface LegalAcceptance {
  readonly id: LegalAcceptanceId;
  readonly subjectType: LegalAcceptanceSubjectType;
  /** UUID v4 : `auth_users.id` (subjectType=user) ou `briefs.id` (subjectType=brief) */
  readonly subjectId: string;
  readonly documentType: LegalDocumentType;
  readonly documentVersion: number;
  readonly acceptedAt: Date;
  /** IPv4 ou IPv6, Loi 25 art. 8 traçabilité technique */
  readonly ipAddress: string;
  readonly userAgent: string;
}
