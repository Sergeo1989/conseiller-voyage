// T102 — Tests RevokeConseillerUseCase.

import {
  AdminIdSchema,
  ConseillerComplianceIdSchema,
  ConseillerIdSchema,
} from '@cv/shared/conformite';
import { beforeEach, describe, expect, it } from 'vitest';
import type { UuidGenerator } from '../../../../../common/ports/uuid-generator.port';
import type { ConseillerCompliance } from '../../../domain/entities/conseiller-compliance.entity';
import type { ConformiteStatus } from '../../../domain/value-objects/conformite-status.vo';
import { FakeClock, FakeConformiteRepository } from '../../__tests__/_fakes';
import { RevokeConseillerUseCase } from '../revoke-conseiller.use-case';

class FakeUuidGenerator implements UuidGenerator {
  private counter = 1000;
  generate(): string {
    return `00000000-0000-4000-8000-${String(this.counter++).padStart(12, '0')}`;
  }
}

const NOW = new Date('2026-05-24T12:00:00Z');
const COMPLIANCE_ID = ConseillerComplianceIdSchema.parse('00000000-0000-4000-8000-aaaa00000001');
const CONSEILLER_ID = ConseillerIdSchema.parse('00000000-0000-4000-8000-cccc00000001');
const ADMIN_ID = AdminIdSchema.parse('00000000-0000-4000-8000-000000000aaa');
const REASON = 'Conduite réglementaire inacceptable répétée.';

function makeCtx(): {
  useCase: RevokeConseillerUseCase;
  repo: FakeConformiteRepository;
} {
  const repo = new FakeConformiteRepository();
  const clock = new FakeClock(NOW);
  const useCase = new RevokeConseillerUseCase(repo, repo, clock, new FakeUuidGenerator());
  return { useCase, repo };
}

function seedCompliance(repo: FakeConformiteRepository, status: ConformiteStatus): void {
  const compliance: ConseillerCompliance = {
    id: COMPLIANCE_ID,
    conseillerId: CONSEILLER_ID,
    status,
    lastVerifiedAt: status === 'verified' ? new Date('2026-04-01') : null,
    lastStatusChangeAt: new Date('2026-04-01'),
    consentToProcessGivenAt: new Date('2026-03-15'),
    erasureRequestedAt: null,
    anonymizedAt: null,
  };
  repo.compliances.set(compliance.id, compliance);
  repo.compliancesByConseillerId.set(compliance.conseillerId, compliance.id);
}

describe('RevokeConseillerUseCase (T102)', () => {
  let ctx: ReturnType<typeof makeCtx>;

  beforeEach(() => {
    ctx = makeCtx();
  });

  it('verified → revoked : transition + audit + outbox', async () => {
    seedCompliance(ctx.repo, 'verified');

    await ctx.useCase.execute({
      requestedBy: { id: ADMIN_ID, role: 'admin' },
      conseillerComplianceId: COMPLIANCE_ID,
      reason: REASON,
    });

    const compliance = ctx.repo.compliances.get(COMPLIANCE_ID);
    expect(compliance?.status).toBe('revoked');
    expect(ctx.repo.writerAuditEntries).toHaveLength(1);
    expect(ctx.repo.writerAuditEntries[0]?.eventType).toBe('status.changed_to_revoked');
    expect(ctx.repo.writerOutboxEntries).toHaveLength(1);
    expect((ctx.repo.writerOutboxEntries[0]?.payload as { cause: string }).cause).toBe(
      'admin_revocation',
    );
  });

  it('suspended → revoked : transition autorisée', async () => {
    seedCompliance(ctx.repo, 'suspended');
    await ctx.useCase.execute({
      requestedBy: { id: ADMIN_ID, role: 'admin' },
      conseillerComplianceId: COMPLIANCE_ID,
      reason: REASON,
    });
    expect(ctx.repo.compliances.get(COMPLIANCE_ID)?.status).toBe('revoked');
  });

  it('déjà revoked → 409 ConflictException', async () => {
    seedCompliance(ctx.repo, 'revoked');
    await expect(
      ctx.useCase.execute({
        requestedBy: { id: ADMIN_ID, role: 'admin' },
        conseillerComplianceId: COMPLIANCE_ID,
        reason: REASON,
      }),
    ).rejects.toThrow(/déjà révoqué/i);
  });

  it('pending → revoked : transition NON autorisée (403)', async () => {
    seedCompliance(ctx.repo, 'pending');
    await expect(
      ctx.useCase.execute({
        requestedBy: { id: ADMIN_ID, role: 'admin' },
        conseillerComplianceId: COMPLIANCE_ID,
        reason: REASON,
      }),
    ).rejects.toThrow(/non autorisée/i);
  });

  it('RBAC : rejette conseiller', async () => {
    seedCompliance(ctx.repo, 'verified');
    await expect(
      ctx.useCase.execute({
        requestedBy: { id: ADMIN_ID, role: 'conseiller' },
        conseillerComplianceId: COMPLIANCE_ID,
        reason: REASON,
      }),
    ).rejects.toThrow(/admin/i);
  });

  it('reason < 20 chars → 400', async () => {
    seedCompliance(ctx.repo, 'verified');
    await expect(
      ctx.useCase.execute({
        requestedBy: { id: ADMIN_ID, role: 'admin' },
        conseillerComplianceId: COMPLIANCE_ID,
        reason: 'Trop court.',
      }),
    ).rejects.toThrow(/≥ 20 characters/);
  });

  it('reason > 2000 chars → 400', async () => {
    seedCompliance(ctx.repo, 'verified');
    await expect(
      ctx.useCase.execute({
        requestedBy: { id: ADMIN_ID, role: 'admin' },
        conseillerComplianceId: COMPLIANCE_ID,
        reason: 'A'.repeat(2001),
      }),
    ).rejects.toThrow(/≤ 2000 characters/);
  });

  it('compliance introuvable → 404', async () => {
    const unknown = ConseillerComplianceIdSchema.parse('00000000-0000-4000-8000-aaaa00099999');
    await expect(
      ctx.useCase.execute({
        requestedBy: { id: ADMIN_ID, role: 'admin' },
        conseillerComplianceId: unknown,
        reason: REASON,
      }),
    ).rejects.toThrow(/introuvable/i);
  });

  it('audit + outbox capturent le reason dans le payload outbox', async () => {
    seedCompliance(ctx.repo, 'verified');
    await ctx.useCase.execute({
      requestedBy: { id: ADMIN_ID, role: 'admin' },
      conseillerComplianceId: COMPLIANCE_ID,
      reason: REASON,
    });
    expect((ctx.repo.writerOutboxEntries[0]?.payload as { reason: string }).reason).toBe(REASON);
  });
});
