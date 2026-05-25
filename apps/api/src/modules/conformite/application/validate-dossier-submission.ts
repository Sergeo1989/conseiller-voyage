// T047 — Implémentation pure de validateDossierSubmission.
// Fait passer les tests T033 du RED au GREEN.
//
// Règles enforced :
//  - FR-016 : consentement explicite obligatoire
//  - FR-001 : ≥ 1 certificat et ≥ 1 affiliation
//  - FR-021 : ≤ 2 certificats (1 CCV + 1 TICO), ≤ 5 affiliations
//  - Cohérence : expiresAt > issuedAt sur chaque certificat
//
// Pas de short-circuit : toutes les erreurs sont accumulées (Principe IV
// — l'utilisateur voit toutes ses erreurs en une fois).

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

const MIN_CERTIFICATES = 1;
const MAX_CERTIFICATES = 2; // 1 CCV (QC) + 1 TICO (ON) au maximum
const MIN_AFFILIATIONS = 1;
const MAX_AFFILIATIONS = 5;

// Sous-validateurs extraits pour respecter complexité cognitive Biome.

function validateConsent(input: DossierSubmissionInput, errors: ValidationFailure[]): void {
  if (!input.consentGiven) {
    errors.push({
      path: 'consentGiven',
      message: 'Le consentement explicite est obligatoire (FR-016).',
    });
  }
}

function validateCertificatesCount(
  input: DossierSubmissionInput,
  errors: ValidationFailure[],
): void {
  if (input.certificates.length < MIN_CERTIFICATES) {
    errors.push({
      path: 'certificates',
      message: 'Au moins un certificat est requis (FR-001).',
    });
  }
  if (input.certificates.length > MAX_CERTIFICATES) {
    errors.push({
      path: 'certificates',
      message: `Maximum ${MAX_CERTIFICATES} certificats (1 CCV Québec + 1 TICO Ontario).`,
    });
  }
}

function validateAffiliationsCount(
  input: DossierSubmissionInput,
  errors: ValidationFailure[],
): void {
  if (input.affiliations.length < MIN_AFFILIATIONS) {
    errors.push({
      path: 'affiliations',
      message: 'Au moins une affiliation est requise (FR-001).',
    });
  }
  if (input.affiliations.length > MAX_AFFILIATIONS) {
    errors.push({
      path: 'affiliations',
      message: `Maximum ${MAX_AFFILIATIONS} affiliations (FR-021).`,
    });
  }
}

function validateCertificateDates(
  input: DossierSubmissionInput,
  errors: ValidationFailure[],
): void {
  for (const [i, cert] of input.certificates.entries()) {
    if (cert.expiresAt <= cert.issuedAt) {
      errors.push({
        path: `certificates[${i}].expiresAt`,
        message: "La date d'expiration doit être strictement postérieure à la date d'émission.",
      });
    }
  }
}

export function validateDossierSubmission(input: DossierSubmissionInput): ValidationResult {
  const errors: ValidationFailure[] = [];

  validateConsent(input, errors);
  validateCertificatesCount(input, errors);
  validateAffiliationsCount(input, errors);
  validateCertificateDates(input, errors);

  if (errors.length === 0) {
    return { success: true, data: input };
  }
  return { success: false, errors };
}
