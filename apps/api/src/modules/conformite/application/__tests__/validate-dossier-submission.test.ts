// T033 — Test TDD pour validateDossierSubmission (Principe VI NON-NÉGOCIABLE).
// Écrit AVANT l'implémentation T047 (Phase 3B) → RED jusque-là.
//
// Couvre les exigences fonctionnelles : FR-001 (au moins 1 cert + 1
// affiliation), FR-016 (consentement explicite), FR-021 (max 5 fichiers),
// + cohérence dates (issuedAt < expiresAt).

import { describe, expect, it } from 'vitest';
import type { Province } from '../../domain/value-objects/province.vo';
import {
  type DossierSubmissionAffiliationInput,
  type DossierSubmissionCertificateInput,
  type DossierSubmissionInput,
  validateDossierSubmission,
} from '../validate-dossier-submission';

function makeCertInput(
  overrides: Partial<DossierSubmissionCertificateInput> = {},
): DossierSubmissionCertificateInput {
  return {
    province: 'QC',
    certificateNumber: 'CCV-12345',
    issuedAt: new Date('2024-01-01T00:00:00Z'),
    expiresAt: new Date('2027-01-01T00:00:00Z'),
    documentUploadId: '00000000-0000-4000-8000-000000000a01',
    ...overrides,
  };
}

function makeAffilInput(
  overrides: Partial<DossierSubmissionAffiliationInput> = {},
): DossierSubmissionAffiliationInput {
  return {
    agencyName: 'Voyages Test Inc.',
    agencyPermitNumber: 'OPC-50001',
    agencyProvince: 'QC',
    proofUploadId: '00000000-0000-4000-8000-000000000a02',
    ...overrides,
  };
}

function makeInput(overrides: Partial<DossierSubmissionInput> = {}): DossierSubmissionInput {
  return {
    consentGiven: true,
    certificates: [makeCertInput()],
    affiliations: [makeAffilInput()],
    ...overrides,
  };
}

describe('validateDossierSubmission (T033 — impl en Phase 3B / T047)', () => {
  describe('cas nominal', () => {
    it('accepte un dossier valide (1 cert + 1 affiliation + consentement)', () => {
      const result = validateDossierSubmission(makeInput());
      expect(result.success).toBe(true);
    });
  });

  describe('consentement (FR-016)', () => {
    it('refuse si consentement non donné', () => {
      const result = validateDossierSubmission(makeInput({ consentGiven: false }));
      expect(result.success).toBe(false);
    });
  });

  describe('quantité minimale (FR-001)', () => {
    it('refuse si aucun certificat', () => {
      const result = validateDossierSubmission(makeInput({ certificates: [] }));
      expect(result.success).toBe(false);
    });

    it('refuse si aucune affiliation', () => {
      const result = validateDossierSubmission(makeInput({ affiliations: [] }));
      expect(result.success).toBe(false);
    });
  });

  describe('quantité maximale (FR-021)', () => {
    it('refuse si > 2 certificats (1 CCV + 1 TICO max)', () => {
      const result = validateDossierSubmission(
        makeInput({
          certificates: [
            makeCertInput({ province: 'QC' }),
            makeCertInput({ province: 'ON' }),
            makeCertInput({ province: 'QC' }),
          ],
        }),
      );
      expect(result.success).toBe(false);
    });

    it('refuse si > 5 affiliations', () => {
      const provinces: ReadonlyArray<Province> = ['QC', 'QC', 'QC', 'QC', 'QC', 'QC'];
      const result = validateDossierSubmission(
        makeInput({
          affiliations: provinces.map((p, i) =>
            makeAffilInput({
              agencyName: `Agence ${i}`,
              agencyPermitNumber: `OPC-9999${i}`,
              agencyProvince: p,
            }),
          ),
        }),
      );
      expect(result.success).toBe(false);
    });
  });

  describe('cohérence des dates', () => {
    it("refuse si date d'expiration <= date d'émission", () => {
      const result = validateDossierSubmission(
        makeInput({
          certificates: [
            makeCertInput({
              issuedAt: new Date('2025-01-01T00:00:00Z'),
              expiresAt: new Date('2024-01-01T00:00:00Z'),
            }),
          ],
        }),
      );
      expect(result.success).toBe(false);
    });

    it("refuse si date d'expiration = date d'émission (pas de marge)", () => {
      const sameDate = new Date('2025-06-15T00:00:00Z');
      const result = validateDossierSubmission(
        makeInput({
          certificates: [makeCertInput({ issuedAt: sameDate, expiresAt: sameDate })],
        }),
      );
      expect(result.success).toBe(false);
    });
  });

  describe("cumul d'erreurs", () => {
    it('retourne plusieurs erreurs en parallèle (pas de short-circuit)', () => {
      const result = validateDossierSubmission(
        makeInput({
          consentGiven: false,
          certificates: [],
          affiliations: [],
        }),
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.errors.length).toBeGreaterThanOrEqual(3);
      }
    });
  });
});
