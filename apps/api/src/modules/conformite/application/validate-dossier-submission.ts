// T033 (test) + T047 (impl en Phase 3B) — STUB en Phase 3A.
// Le throw rend tous les tests T033 RED visible jusqu'à T047.

import type { Province } from '../domain/value-objects/province.vo';

export interface DossierSubmissionCertificateInput {
  readonly province: Province;
  readonly certificateNumber: string;
  readonly issuedAt: Date;
  readonly expiresAt: Date;
  readonly documentUploadId: string;
}

export interface DossierSubmissionAffiliationInput {
  readonly agencyName: string;
  readonly agencyPermitNumber: string;
  readonly agencyProvince: Province;
  readonly proofUploadId: string;
  readonly role?: string;
  readonly activeSince?: Date;
}

export interface DossierSubmissionInput {
  readonly consentGiven: boolean;
  readonly certificates: ReadonlyArray<DossierSubmissionCertificateInput>;
  readonly affiliations: ReadonlyArray<DossierSubmissionAffiliationInput>;
}

export interface ValidationFailure {
  readonly path: string;
  readonly message: string;
}

export type ValidationResult =
  | { readonly success: true; readonly data: DossierSubmissionInput }
  | { readonly success: false; readonly errors: ReadonlyArray<ValidationFailure> };

export function validateDossierSubmission(_input: DossierSubmissionInput): ValidationResult {
  throw new Error('validateDossierSubmission not yet implemented (T047 — Phase 3B, TDD red).');
}
