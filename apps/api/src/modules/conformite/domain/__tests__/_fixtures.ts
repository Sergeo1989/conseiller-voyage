// Fixtures partagées pour les tests du domaine conformité.
// Underscore prefix → non capté par vitest comme test file.
// Factory functions retournent une entité valide par défaut, override
// via `overrides` partiel.

import {
  AffiliationIdSchema,
  CertificatIdSchema,
  ConseillerComplianceIdSchema,
  PermitRevocationIdSchema,
} from '@cv/shared/conformite';
import type { Affiliation } from '../entities/affiliation.entity';
import type { Certificat } from '../entities/certificat.entity';
import type { PermitRevocation } from '../entities/permit-revocation.entity';

export function uuid(n: number): string {
  return `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
}

export const FIXTURE_COMPLIANCE_ID = ConseillerComplianceIdSchema.parse(uuid(1));
export const FIXTURE_ADMIN_ID = uuid(900);

export function makeCertificat(overrides: Partial<Certificat> = {}): Certificat {
  return {
    id: CertificatIdSchema.parse(uuid(101)),
    conseillerComplianceId: FIXTURE_COMPLIANCE_ID,
    province: 'QC',
    certificateNumber: 'CCV-12345',
    issuedAt: new Date('2024-01-01T00:00:00Z'),
    expiresAt: new Date('2027-01-01T00:00:00Z'),
    documentObjectKey: `conformite/${uuid(1)}/cert-${uuid(101)}`,
    submittedAt: new Date('2024-01-02T00:00:00Z'),
    decision: 'approved',
    decisionAt: new Date('2024-01-05T00:00:00Z'),
    decisionByAdminId: FIXTURE_ADMIN_ID,
    refusalReason: null,
    supersededById: null,
    ...overrides,
  };
}

export function makeAffiliation(overrides: Partial<Affiliation> = {}): Affiliation {
  return {
    id: AffiliationIdSchema.parse(uuid(201)),
    conseillerComplianceId: FIXTURE_COMPLIANCE_ID,
    agencyName: 'Voyages Test Inc.',
    agencyPermitNumber: 'OPC-50001',
    agencyProvince: 'QC',
    proofObjectKey: `conformite/${uuid(1)}/proof-${uuid(201)}`,
    submittedAt: new Date('2024-01-02T00:00:00Z'),
    decision: 'approved',
    decisionAt: new Date('2024-01-05T00:00:00Z'),
    decisionByAdminId: FIXTURE_ADMIN_ID,
    refusalReason: null,
    role: 'Conseillère senior',
    activeSince: new Date('2024-01-05T00:00:00Z'),
    activeUntil: null,
    inactivatedBy: null,
    inactivatedAt: null,
    ...overrides,
  };
}

export function makePermitRevocation(overrides: Partial<PermitRevocation> = {}): PermitRevocation {
  return {
    id: PermitRevocationIdSchema.parse(uuid(301)),
    agencyPermitNumber: 'OPC-50001',
    agencyProvince: 'QC',
    revokedAt: new Date('2026-06-01T00:00:00Z'),
    declaredByAdminId: FIXTURE_ADMIN_ID,
    reason: 'Test revocation for fixtures — purely synthetic.',
    ...overrides,
  };
}
