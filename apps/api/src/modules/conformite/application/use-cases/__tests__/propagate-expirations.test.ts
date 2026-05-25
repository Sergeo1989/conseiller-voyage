// T083 — Tests PropagateExpirationsUseCase.

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
import {
  FakeClock,
  FakeConformiteRepository,
  FakeConformiteStatusCache,
} from '../../__tests__/_fakes';
import { PropagateExpirationsUseCase } from '../propagate-expirations.use-case';

class FakeUuidGenerator implements UuidGenerator {
  private counter = 800;
  generate(): string {
    return `00000000-0000-4000-8000-${String(this.counter++).padStart(12, '0')}`;
  }
}

const NOW = new Date('2026-05-24T12:00:00Z');
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const COMPLIANCE_ID = ConseillerComplianceIdSchema.parse('00000000-0000-4000-8000-aaaa00000001');
const CONSEILLER_ID = ConseillerIdSchema.parse('00000000-0000-4000-8000-cccc00000001');

function makeContext(): {
  useCase: PropagateExpirationsUseCase;
  repo: FakeConformiteRepository;
  cache: FakeConformiteStatusCache;
} {
  const repo = new FakeConformiteRepository();
  const clock = new FakeClock(NOW);
  const uuidGen = new FakeUuidGenerator();
  const cache = new FakeConformiteStatusCache();
  const useCase = new PropagateExpirationsUseCase(repo, repo, clock, uuidGen, cache);
  return { useCase, repo, cache };
}

function seedVerifiedConseiller(repo: FakeConformiteRepository): void {
  const compliance: ConseillerCompliance = {
    id: COMPLIANCE_ID,
    conseillerId: CONSEILLER_ID,
    status: 'verified',
    lastVerifiedAt: new Date('2025-01-20'),
    lastStatusChangeAt: new Date('2025-01-20'),
    consentToProcessGivenAt: new Date('2025-01-15'),
    erasureRequestedAt: null,
    anonymizedAt: null,
  };
  repo.compliances.set(compliance.id, compliance);
  repo.compliancesByConseillerId.set(compliance.conseillerId, compliance.id);
}

function addCert(repo: FakeConformiteRepository, suffix: string, expiresAt: Date): Certificat {
  const id = CertificatIdSchema.parse(`00000000-0000-4000-8000-${suffix.padStart(12, 'a')}`);
  const cert: Certificat = {
    id,
    conseillerComplianceId: COMPLIANCE_ID,
    province: 'QC',
    certificateNumber: `CCV-${suffix}`,
    issuedAt: new Date('2025-01-01'),
    expiresAt,
    documentObjectKey: `conformite/${COMPLIANCE_ID}/${suffix}`,
    submittedAt: new Date('2025-01-15'),
    decision: 'approved',
    decisionAt: new Date('2025-01-20'),
    decisionByAdminId: null,
    refusalReason: null,
    supersededById: null,
  };
  repo.certificats.set(cert.id, cert);
  return cert;
}

function addAffiliation(repo: FakeConformiteRepository, suffix: string): Affiliation {
  const id = AffiliationIdSchema.parse(`00000000-0000-4000-8000-${suffix.padStart(12, 'b')}`);
  const affil: Affiliation = {
    id,
    conseillerComplianceId: COMPLIANCE_ID,
    agencyName: 'Agence Test',
    agencyPermitNumber: 'OPC-998877',
    agencyProvince: 'QC',
    proofObjectKey: `conformite/${COMPLIANCE_ID}/affil-${suffix}`,
    submittedAt: new Date('2025-01-15'),
    decision: 'approved',
    decisionAt: new Date('2025-01-20'),
    decisionByAdminId: null,
    refusalReason: null,
    role: null,
    activeSince: null,
    activeUntil: null,
    inactivatedBy: null,
    inactivatedAt: null,
  };
  repo.affiliations.set(affil.id, affil);
  return affil;
}

describe('PropagateExpirationsUseCase (T083)', () => {
  let ctx: ReturnType<typeof makeContext>;

  beforeEach(() => {
    ctx = makeContext();
    seedVerifiedConseiller(ctx.repo);
    addAffiliation(ctx.repo, '0001');
  });

  it('bascule verified → suspended quand tous les certs sont expirés', async () => {
    addCert(ctx.repo, '0001', new Date(NOW.getTime() - MS_PER_DAY)); // expiré hier

    const result = await ctx.useCase.execute();

    expect(result.suspendedCount).toBe(1);
    const compliance = ctx.repo.compliances.get(COMPLIANCE_ID);
    expect(compliance?.status).toBe('suspended');
    expect(compliance?.lastStatusChangeAt.getTime()).toBe(NOW.getTime());
  });

  it('NE bascule PAS quand un cert est encore valide', async () => {
    addCert(ctx.repo, '0001', new Date(NOW.getTime() - MS_PER_DAY)); // expiré
    addCert(ctx.repo, '0002', new Date(NOW.getTime() + 30 * MS_PER_DAY)); // valide

    const result = await ctx.useCase.execute();

    expect(result.suspendedCount).toBe(0);
    expect(ctx.repo.compliances.get(COMPLIANCE_ID)?.status).toBe('verified');
  });

  it('écrit AuditEntry expiration.auto_suspended + status.changed_to_suspended', async () => {
    addCert(ctx.repo, '0001', new Date(NOW.getTime() - MS_PER_DAY));
    await ctx.useCase.execute();
    expect(ctx.repo.writerAuditEntries).toHaveLength(2);
    expect(ctx.repo.writerAuditEntries[0]?.eventType).toBe('expiration.auto_suspended');
    expect(ctx.repo.writerAuditEntries[0]?.actorRole).toBe('system');
    expect(ctx.repo.writerAuditEntries[1]?.eventType).toBe('status.changed_to_suspended');
  });

  it('écrit OutboxEntry conformite.status.changed avec cause=certificate_expiration', async () => {
    addCert(ctx.repo, '0001', new Date(NOW.getTime() - MS_PER_DAY));
    await ctx.useCase.execute();
    expect(ctx.repo.writerOutboxEntries).toHaveLength(1);
    expect(ctx.repo.writerOutboxEntries[0]?.eventType).toBe('conformite.status.changed');
    expect((ctx.repo.writerOutboxEntries[0]?.payload as { cause: string }).cause).toBe(
      'certificate_expiration',
    );
    expect(
      (ctx.repo.writerOutboxEntries[0]?.payload as { transitionKind: string }).transitionKind,
    ).toBe('negative');
  });

  it('respecte asOf override (rejeu)', async () => {
    const future = new Date(NOW.getTime() + 90 * MS_PER_DAY);
    addCert(ctx.repo, '0001', new Date(NOW.getTime() + 30 * MS_PER_DAY)); // expirera entre temps

    const result = await ctx.useCase.execute({ asOf: future });
    expect(result.suspendedCount).toBe(1);
  });

  it('ne fait rien si aucun conseiller verified', async () => {
    ctx.repo.compliances.clear();
    const result = await ctx.useCase.execute();
    expect(result.suspendedCount).toBe(0);
  });

  it('idempotencyKey audit basé sur date du sweep (rejeu safe)', async () => {
    addCert(ctx.repo, '0001', new Date(NOW.getTime() - MS_PER_DAY));
    await ctx.useCase.execute();
    expect(ctx.repo.writerAuditEntries[0]?.idempotencyKey).toBe(
      `expiration:${COMPLIANCE_ID}:2026-05-24`,
    );
  });

  it('cache invalidate synchrone après auto-suspension (eng review issue 1.1)', async () => {
    addCert(ctx.repo, '0001', new Date(NOW.getTime() - MS_PER_DAY));
    await ctx.useCase.execute();
    expect(ctx.cache.invalidations).toEqual([CONSEILLER_ID]);
  });

  it("n'invalide PAS le cache si aucune transition", async () => {
    addCert(ctx.repo, '0001', new Date(NOW.getTime() + 30 * MS_PER_DAY)); // valide
    await ctx.useCase.execute();
    expect(ctx.cache.invalidations).toEqual([]);
  });
});
