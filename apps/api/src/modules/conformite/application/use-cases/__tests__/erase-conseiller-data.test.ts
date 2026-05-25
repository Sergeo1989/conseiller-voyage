// T112 — Tests EraseConseillerData (both use cases).

import {
  AffiliationIdSchema,
  CertificatIdSchema,
  ConseillerComplianceIdSchema,
  ConseillerIdSchema,
} from '@cv/shared/conformite';
import { beforeEach, describe, expect, it } from 'vitest';
import type { UuidGenerator } from '../../../../../common/ports/uuid-generator.port';
import type { Affiliation } from '../../../domain/entities/affiliation.entity';
import type { Certificat } from '../../../domain/entities/certificat.entity';
import type { ConseillerCompliance } from '../../../domain/entities/conseiller-compliance.entity';
import { FakeClock, FakeConformiteRepository, FakeDocumentStorage } from '../../__tests__/_fakes';
import { EraseConseillerDataUseCase } from '../erase-conseiller-data.use-case';
import { RequestErasureUseCase } from '../request-erasure.use-case';

class FakeUuidGenerator implements UuidGenerator {
  private counter = 2000;
  generate(): string {
    return `00000000-0000-4000-8000-${String(this.counter++).padStart(12, '0')}`;
  }
}

const NOW = new Date('2026-05-24T12:00:00Z');
const CONSEILLER_ID = ConseillerIdSchema.parse('00000000-0000-4000-8000-cccc00000001');
const COMPLIANCE_ID = ConseillerComplianceIdSchema.parse('00000000-0000-4000-8000-aaaa00000001');

function seedCompliance(
  repo: FakeConformiteRepository,
  options: { erasureRequestedAt?: Date | null; anonymizedAt?: Date | null } = {},
): void {
  const compliance: ConseillerCompliance = {
    id: COMPLIANCE_ID,
    conseillerId: CONSEILLER_ID,
    status: 'verified',
    lastVerifiedAt: new Date('2026-04-01'),
    lastStatusChangeAt: new Date('2026-04-01'),
    consentToProcessGivenAt: new Date('2026-03-15'),
    erasureRequestedAt: options.erasureRequestedAt ?? null,
    anonymizedAt: options.anonymizedAt ?? null,
  };
  repo.compliances.set(COMPLIANCE_ID, compliance);
  repo.compliancesByConseillerId.set(CONSEILLER_ID, COMPLIANCE_ID);
}

function seedDocs(repo: FakeConformiteRepository, storage: FakeDocumentStorage): void {
  const certId = CertificatIdSchema.parse('00000000-0000-4000-8000-cc0000000001');
  const cert: Certificat = {
    id: certId,
    conseillerComplianceId: COMPLIANCE_ID,
    province: 'QC',
    certificateNumber: 'CCV-X',
    issuedAt: new Date('2026-01-01'),
    expiresAt: new Date('2028-01-01'),
    documentObjectKey: 'conformite/abc/cert.pdf',
    submittedAt: new Date('2026-01-15'),
    decision: 'approved',
    decisionAt: new Date('2026-01-20'),
    decisionByAdminId: null,
    refusalReason: null,
    supersededById: null,
  };
  repo.certificats.set(certId, cert);
  storage.storage.set(cert.documentObjectKey, {
    contentType: 'application/pdf',
    contentLength: 1000,
    lastModified: new Date(),
  });

  const affilId = AffiliationIdSchema.parse('00000000-0000-4000-8000-aaaaaa000002');
  const affil: Affiliation = {
    id: affilId,
    conseillerComplianceId: COMPLIANCE_ID,
    agencyName: 'Agence X',
    agencyPermitNumber: 'OPC-X',
    agencyProvince: 'QC',
    proofObjectKey: 'conformite/abc/affil.pdf',
    submittedAt: new Date('2026-01-15'),
    decision: 'approved',
    decisionAt: new Date('2026-01-20'),
    decisionByAdminId: null,
    refusalReason: null,
    role: null,
    activeSince: null,
    activeUntil: null,
    inactivatedBy: null,
    inactivatedAt: null,
  };
  repo.affiliations.set(affilId, affil);
  storage.storage.set(affil.proofObjectKey, {
    contentType: 'application/pdf',
    contentLength: 1000,
    lastModified: new Date(),
  });
}

describe('RequestErasureUseCase (T112 — step 1)', () => {
  let repo: FakeConformiteRepository;
  let useCase: RequestErasureUseCase;

  beforeEach(() => {
    repo = new FakeConformiteRepository();
    useCase = new RequestErasureUseCase(repo, repo, new FakeClock(NOW), new FakeUuidGenerator());
  });

  it('marque erasureRequestedAt + audit erasure.requested + outbox', async () => {
    seedCompliance(repo);
    await useCase.execute({ requestedBy: { id: CONSEILLER_ID, role: 'conseiller' } });

    const compliance = repo.compliances.get(COMPLIANCE_ID);
    expect(compliance?.erasureRequestedAt?.getTime()).toBe(NOW.getTime());
    expect(repo.writerAuditEntries[0]?.eventType).toBe('erasure.requested');
    expect(repo.writerOutboxEntries[0]?.eventType).toBe('conformite.erasure.requested');
  });

  it('RBAC : rejette admin', async () => {
    seedCompliance(repo);
    await expect(
      useCase.execute({ requestedBy: { id: CONSEILLER_ID, role: 'admin' } }),
    ).rejects.toThrow(/conseiller/i);
  });

  it('404 sans dossier', async () => {
    await expect(
      useCase.execute({ requestedBy: { id: CONSEILLER_ID, role: 'conseiller' } }),
    ).rejects.toThrow(/effacer/i);
  });

  it('409 si déjà anonymisé', async () => {
    seedCompliance(repo, { anonymizedAt: NOW });
    await expect(
      useCase.execute({ requestedBy: { id: CONSEILLER_ID, role: 'conseiller' } }),
    ).rejects.toThrow(/anonymisé/i);
  });

  it('409 si déjà demandé (en cours)', async () => {
    seedCompliance(repo, { erasureRequestedAt: NOW });
    await expect(
      useCase.execute({ requestedBy: { id: CONSEILLER_ID, role: 'conseiller' } }),
    ).rejects.toThrow(/cours/i);
  });
});

describe('EraseConseillerDataUseCase (T112 — step 2 async)', () => {
  let repo: FakeConformiteRepository;
  let storage: FakeDocumentStorage;
  let useCase: EraseConseillerDataUseCase;

  beforeEach(() => {
    repo = new FakeConformiteRepository();
    storage = new FakeDocumentStorage();
    useCase = new EraseConseillerDataUseCase(
      repo,
      repo,
      storage,
      new FakeClock(NOW),
      new FakeUuidGenerator(),
    );
  });

  it('supprime tous les S3 objects + anonymise compliance + audit completed', async () => {
    seedCompliance(repo, { erasureRequestedAt: new Date('2026-05-20') });
    seedDocs(repo, storage);

    await useCase.execute({ conseillerComplianceId: COMPLIANCE_ID });

    expect(storage.deletes).toHaveLength(2);
    expect(storage.deletes).toContain('conformite/abc/cert.pdf');
    expect(storage.deletes).toContain('conformite/abc/affil.pdf');

    const compliance = repo.compliances.get(COMPLIANCE_ID);
    expect(compliance?.anonymizedAt?.getTime()).toBe(NOW.getTime());

    expect(repo.writerAuditEntries[0]?.eventType).toBe('erasure.completed');
    expect(repo.writerAuditEntries[0]?.actorRole).toBe('system');
    expect(repo.writerOutboxEntries[0]?.eventType).toBe('conformite.erasure.completed');
  });

  it('no-op silencieux si compliance déjà anonymisée (idempotent)', async () => {
    seedCompliance(repo, { anonymizedAt: NOW });
    seedDocs(repo, storage);

    await useCase.execute({ conseillerComplianceId: COMPLIANCE_ID });

    expect(storage.deletes).toHaveLength(0);
    expect(repo.writerAuditEntries).toHaveLength(0);
  });

  it('no-op silencieux si compliance introuvable', async () => {
    await useCase.execute({ conseillerComplianceId: COMPLIANCE_ID });
    expect(repo.writerAuditEntries).toHaveLength(0);
  });

  it('idempotencyKey audit déterministe sur complianceId', async () => {
    seedCompliance(repo, { erasureRequestedAt: new Date('2026-05-20') });
    seedDocs(repo, storage);
    await useCase.execute({ conseillerComplianceId: COMPLIANCE_ID });
    expect(repo.writerAuditEntries[0]?.idempotencyKey).toBe(`erasure:${COMPLIANCE_ID}`);
  });
});
