// T107 — Tests ViewConseillerDossierUseCase.

import { ConseillerComplianceIdSchema, ConseillerIdSchema } from '@cv/shared/conformite';
import { beforeEach, describe, expect, it } from 'vitest';
import { FakeConformiteRepository } from '../../__tests__/_fakes';
import { ViewConseillerDossierUseCase } from '../view-conseiller-dossier.use-case';

const CONSEILLER_ID = ConseillerIdSchema.parse('00000000-0000-4000-8000-cccc00000001');
const COMPLIANCE_ID = ConseillerComplianceIdSchema.parse('00000000-0000-4000-8000-aaaa00000001');

function makeCtx(): {
  useCase: ViewConseillerDossierUseCase;
  repo: FakeConformiteRepository;
} {
  const repo = new FakeConformiteRepository();
  const useCase = new ViewConseillerDossierUseCase(repo);
  return { useCase, repo };
}

function seedCompliance(repo: FakeConformiteRepository, anonymized = false): void {
  const compliance = {
    id: COMPLIANCE_ID,
    conseillerId: CONSEILLER_ID,
    status: 'verified' as const,
    lastVerifiedAt: new Date('2026-04-01'),
    lastStatusChangeAt: new Date('2026-04-01'),
    consentToProcessGivenAt: new Date('2026-03-15'),
    erasureRequestedAt: null,
    anonymizedAt: anonymized ? new Date('2026-04-15') : null,
  };
  repo.compliances.set(compliance.id, compliance);
  repo.compliancesByConseillerId.set(compliance.conseillerId, compliance.id);
}

function seedAuditEntries(repo: FakeConformiteRepository, count: number): void {
  for (let i = 0; i < count; i += 1) {
    repo.auditEntries.push({
      id: `00000000-0000-4000-8000-${String(i).padStart(12, 'e')}`,
      conseillerComplianceId: COMPLIANCE_ID,
      eventType: 'dossier.submitted',
      actorRole: 'conseiller',
      occurredAt: new Date(Date.UTC(2026, 4, 24 - i)), // antichrono : plus récent = i=0
      payload: { idx: i },
    });
  }
}

describe('ViewConseillerDossierUseCase (T107)', () => {
  let ctx: ReturnType<typeof makeCtx>;

  beforeEach(() => {
    ctx = makeCtx();
  });

  it('retourne dossier + audit antichronologique paginé (20 par défaut)', async () => {
    seedCompliance(ctx.repo);
    seedAuditEntries(ctx.repo, 30);

    const result = await ctx.useCase.execute({
      requestedBy: { id: CONSEILLER_ID, role: 'conseiller' },
    });

    expect(result.compliance.id).toBe(COMPLIANCE_ID);
    expect(result.audit.items).toHaveLength(20);
    expect(result.audit.nextCursor).not.toBeNull();
    // Premier item = plus récent
    expect((result.audit.items[0]?.payload as { idx: number }).idx).toBe(0);
  });

  it('respecte pageSize custom', async () => {
    seedCompliance(ctx.repo);
    seedAuditEntries(ctx.repo, 30);

    const result = await ctx.useCase.execute({
      requestedBy: { id: CONSEILLER_ID, role: 'conseiller' },
      auditPageSize: 5,
    });

    expect(result.audit.items).toHaveLength(5);
    expect(result.audit.nextCursor).not.toBeNull();
  });

  it('nextCursor permet la page suivante', async () => {
    seedCompliance(ctx.repo);
    seedAuditEntries(ctx.repo, 10);

    const page1 = await ctx.useCase.execute({
      requestedBy: { id: CONSEILLER_ID, role: 'conseiller' },
      auditPageSize: 5,
    });
    const page2 = await ctx.useCase.execute({
      requestedBy: { id: CONSEILLER_ID, role: 'conseiller' },
      auditPageSize: 5,
      auditCursor: page1.audit.nextCursor,
    });

    expect(page2.audit.items).toHaveLength(5);
    expect((page2.audit.items[0]?.payload as { idx: number }).idx).toBe(5);
    expect(page2.audit.nextCursor).toBeNull();
  });

  it('nextCursor null si moins de pageSize résultats', async () => {
    seedCompliance(ctx.repo);
    seedAuditEntries(ctx.repo, 3);

    const result = await ctx.useCase.execute({
      requestedBy: { id: CONSEILLER_ID, role: 'conseiller' },
      auditPageSize: 5,
    });

    expect(result.audit.items).toHaveLength(3);
    expect(result.audit.nextCursor).toBeNull();
  });

  it('RBAC : rejette admin', async () => {
    seedCompliance(ctx.repo);
    await expect(
      ctx.useCase.execute({ requestedBy: { id: CONSEILLER_ID, role: 'admin' } }),
    ).rejects.toThrow(/conseiller/i);
  });

  it('404 si pas de dossier', async () => {
    await expect(
      ctx.useCase.execute({ requestedBy: { id: CONSEILLER_ID, role: 'conseiller' } }),
    ).rejects.toThrow(/trouvé/i);
  });

  it('404 si dossier anonymisé Loi 25', async () => {
    seedCompliance(ctx.repo, true);
    await expect(
      ctx.useCase.execute({ requestedBy: { id: CONSEILLER_ID, role: 'conseiller' } }),
    ).rejects.toThrow(/anonymisé/i);
  });
});
