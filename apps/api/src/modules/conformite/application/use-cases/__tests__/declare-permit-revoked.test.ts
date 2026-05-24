// T092 — Tests DeclarePermitRevokedUseCase.

import {
  AdminIdSchema,
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
import { FakeClock, FakeConformiteRepository } from '../../__tests__/_fakes';
import { DeclarePermitRevokedUseCase } from '../declare-permit-revoked.use-case';

class FakeUuidGenerator implements UuidGenerator {
  private counter = 900;
  generate(): string {
    return `00000000-0000-4000-8000-${String(this.counter++).padStart(12, '0')}`;
  }
}

const NOW = new Date('2026-05-24T12:00:00Z');
const ADMIN_ID = AdminIdSchema.parse('00000000-0000-4000-8000-000000000aaa');

function makeCtx(): {
  useCase: DeclarePermitRevokedUseCase;
  repo: FakeConformiteRepository;
} {
  const repo = new FakeConformiteRepository();
  const clock = new FakeClock(NOW);
  const useCase = new DeclarePermitRevokedUseCase(repo, repo, clock, new FakeUuidGenerator());
  return { useCase, repo };
}

function seedConseillerAffiliated(
  repo: FakeConformiteRepository,
  suffix: string,
  permitNumber: string,
): { complianceId: string; affilId: string } {
  const complianceId = ConseillerComplianceIdSchema.parse(
    `00000000-0000-4000-8000-${suffix.padStart(12, 'a')}`,
  );
  const conseillerId = ConseillerIdSchema.parse(
    `00000000-0000-4000-8000-${suffix.padStart(12, 'c')}`,
  );
  const compliance: ConseillerCompliance = {
    id: complianceId,
    conseillerId,
    status: 'verified',
    lastVerifiedAt: new Date('2026-04-01'),
    lastStatusChangeAt: new Date('2026-04-01'),
    consentToProcessGivenAt: new Date('2026-03-15'),
    erasureRequestedAt: null,
    anonymizedAt: null,
  };
  repo.compliances.set(complianceId, compliance);
  repo.compliancesByConseillerId.set(conseillerId, complianceId);

  const certId = CertificatIdSchema.parse(`00000000-0000-4000-8000-${suffix.padStart(12, 'b')}`);
  const cert: Certificat = {
    id: certId,
    conseillerComplianceId: complianceId,
    province: 'QC',
    certificateNumber: 'CCV-X',
    issuedAt: new Date('2026-01-01'),
    expiresAt: new Date('2028-01-01'),
    documentObjectKey: 'k',
    submittedAt: new Date('2026-01-15'),
    decision: 'approved',
    decisionAt: new Date('2026-01-20'),
    decisionByAdminId: null,
    refusalReason: null,
    supersededById: null,
  };
  repo.certificats.set(certId, cert);

  const affilId = AffiliationIdSchema.parse(`00000000-0000-4000-8000-${suffix.padStart(12, 'd')}`);
  const affil: Affiliation = {
    id: affilId,
    conseillerComplianceId: complianceId,
    agencyName: 'Agence X',
    agencyPermitNumber: permitNumber,
    agencyProvince: 'QC',
    proofObjectKey: 'k',
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
  return { complianceId, affilId };
}

const REASON = 'Permis retiré suite à enquête OPC.';
const PERMIT = 'OPC-998877';

describe('DeclarePermitRevokedUseCase (T092)', () => {
  let ctx: ReturnType<typeof makeCtx>;

  beforeEach(() => {
    ctx = makeCtx();
  });

  it('cascade : 3 conseillers affiliés au même permis → 3 suspensions', async () => {
    seedConseillerAffiliated(ctx.repo, '0001', PERMIT);
    seedConseillerAffiliated(ctx.repo, '0002', PERMIT);
    seedConseillerAffiliated(ctx.repo, '0003', PERMIT);

    const result = await ctx.useCase.execute({
      requestedBy: { id: ADMIN_ID, role: 'admin' },
      agencyPermitNumber: PERMIT,
      agencyProvince: 'QC',
      reason: REASON,
    });

    expect(result.affectedConseillerCount).toBe(3);
    expect(result.conseillerSuspensionCount).toBe(3);

    const suspended = [...ctx.repo.compliances.values()].filter((c) => c.status === 'suspended');
    expect(suspended).toHaveLength(3);
  });

  it("n'affecte que les conseillers avec ce permis", async () => {
    seedConseillerAffiliated(ctx.repo, '0001', PERMIT);
    seedConseillerAffiliated(ctx.repo, '0002', 'OPC-OTHER');

    const result = await ctx.useCase.execute({
      requestedBy: { id: ADMIN_ID, role: 'admin' },
      agencyPermitNumber: PERMIT,
      agencyProvince: 'QC',
      reason: REASON,
    });

    expect(result.affectedConseillerCount).toBe(1);
  });

  it('idempotent : double déclaration → 409 ConflictException', async () => {
    seedConseillerAffiliated(ctx.repo, '0001', PERMIT);
    await ctx.useCase.execute({
      requestedBy: { id: ADMIN_ID, role: 'admin' },
      agencyPermitNumber: PERMIT,
      agencyProvince: 'QC',
      reason: REASON,
    });

    await expect(
      ctx.useCase.execute({
        requestedBy: { id: ADMIN_ID, role: 'admin' },
        agencyPermitNumber: PERMIT,
        agencyProvince: 'QC',
        reason: REASON,
      }),
    ).rejects.toThrow(/already revoked/i);
  });

  it('RBAC : rejette role=conseiller', async () => {
    await expect(
      ctx.useCase.execute({
        requestedBy: { id: ADMIN_ID, role: 'conseiller' },
        agencyPermitNumber: PERMIT,
        agencyProvince: 'QC',
        reason: REASON,
      }),
    ).rejects.toThrow(/admin/i);
  });

  it('rejette reason < 20 chars', async () => {
    await expect(
      ctx.useCase.execute({
        requestedBy: { id: ADMIN_ID, role: 'admin' },
        agencyPermitNumber: PERMIT,
        agencyProvince: 'QC',
        reason: 'Trop court.',
      }),
    ).rejects.toThrow(/≥ 20 characters/);
  });

  it('émet AuditEntry permit.revoked_by_admin + N cascade_applied', async () => {
    seedConseillerAffiliated(ctx.repo, '0001', PERMIT);
    seedConseillerAffiliated(ctx.repo, '0002', PERMIT);

    await ctx.useCase.execute({
      requestedBy: { id: ADMIN_ID, role: 'admin' },
      agencyPermitNumber: PERMIT,
      agencyProvince: 'QC',
      reason: REASON,
    });

    const entries = ctx.repo.writerAuditEntries;
    const adminEntry = entries.find((e) => e.eventType === 'permit.revoked_by_admin');
    const cascadeEntries = entries.filter((e) => e.eventType === 'permit.cascade_applied');
    const statusEntries = entries.filter((e) => e.eventType === 'status.changed_to_suspended');

    expect(adminEntry).toBeDefined();
    expect(cascadeEntries).toHaveLength(2);
    expect(statusEntries).toHaveLength(2);
  });

  it('émet 1 OutboxEntry conformite.status.changed par conseiller affecté', async () => {
    seedConseillerAffiliated(ctx.repo, '0001', PERMIT);
    seedConseillerAffiliated(ctx.repo, '0002', PERMIT);

    await ctx.useCase.execute({
      requestedBy: { id: ADMIN_ID, role: 'admin' },
      agencyPermitNumber: PERMIT,
      agencyProvince: 'QC',
      reason: REASON,
    });

    expect(ctx.repo.writerOutboxEntries).toHaveLength(2);
    for (const entry of ctx.repo.writerOutboxEntries) {
      expect(entry.eventType).toBe('conformite.status.changed');
      expect((entry.payload as { cause: string }).cause).toBe('permit_cascade');
    }
  });
});
