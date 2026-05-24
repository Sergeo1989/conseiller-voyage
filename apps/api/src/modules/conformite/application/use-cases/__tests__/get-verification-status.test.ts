// T091 — Tests GetVerificationStatusUseCase.

import { ConseillerComplianceIdSchema, ConseillerIdSchema } from '@cv/shared/conformite';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeConformiteRepository } from '../../__tests__/_fakes';
import type {
  ConformiteStatusCache,
  VerificationStatus,
} from '../../ports/conformite-status-cache.port';
import { GetVerificationStatusUseCase } from '../get-verification-status.use-case';

const CONSEILLER_ID = ConseillerIdSchema.parse('00000000-0000-4000-8000-cccc00000001');
const COMPLIANCE_ID = ConseillerComplianceIdSchema.parse('00000000-0000-4000-8000-aaaa00000001');

class FakeCache implements ConformiteStatusCache {
  public readonly store = new Map<string, VerificationStatus>();
  public readonly getSpy = vi.fn<(id: string) => Promise<VerificationStatus | null>>();
  public readonly setSpy = vi.fn<(s: VerificationStatus) => Promise<void>>();
  public readonly invalidateSpy = vi.fn<(id: string) => Promise<void>>();

  async get(id: string): Promise<VerificationStatus | null> {
    this.getSpy(id);
    return this.store.get(id) ?? null;
  }

  async set(status: VerificationStatus): Promise<void> {
    this.setSpy(status);
    this.store.set(status.conseillerId, status);
  }

  async invalidate(id: string): Promise<void> {
    this.invalidateSpy(id);
    this.store.delete(id);
  }
}

function makeCtx(): {
  useCase: GetVerificationStatusUseCase;
  repo: FakeConformiteRepository;
  cache: FakeCache;
} {
  const repo = new FakeConformiteRepository();
  const cache = new FakeCache();
  const useCase = new GetVerificationStatusUseCase(repo, cache);
  return { useCase, repo, cache };
}

function seedVerified(repo: FakeConformiteRepository): void {
  const compliance = {
    id: COMPLIANCE_ID,
    conseillerId: CONSEILLER_ID,
    status: 'verified' as const,
    lastVerifiedAt: new Date('2026-05-01'),
    lastStatusChangeAt: new Date('2026-05-01'),
    consentToProcessGivenAt: new Date('2026-04-15'),
    erasureRequestedAt: null,
    anonymizedAt: null,
  };
  repo.compliances.set(compliance.id, compliance);
  repo.compliancesByConseillerId.set(compliance.conseillerId, compliance.id);
}

describe('GetVerificationStatusUseCase (T091)', () => {
  let ctx: ReturnType<typeof makeCtx>;

  beforeEach(() => {
    ctx = makeCtx();
  });

  it('cache HIT : retourne le statut en cache sans frapper la DB', async () => {
    seedVerified(ctx.repo);
    ctx.cache.store.set(CONSEILLER_ID, {
      conseillerId: CONSEILLER_ID,
      verified: true,
      lastVerifiedAt: new Date('2026-05-01'),
    });

    const result = await ctx.useCase.execute({ conseillerId: CONSEILLER_ID });

    expect(result.verified).toBe(true);
    expect(ctx.cache.getSpy).toHaveBeenCalledOnce();
    expect(ctx.cache.setSpy).not.toHaveBeenCalled();
  });

  it('cache MISS : lit la DB et write-through dans le cache', async () => {
    seedVerified(ctx.repo);

    const result = await ctx.useCase.execute({ conseillerId: CONSEILLER_ID });

    expect(result.verified).toBe(true);
    expect(result.lastVerifiedAt?.toISOString()).toContain('2026-05-01');
    expect(ctx.cache.getSpy).toHaveBeenCalledOnce();
    expect(ctx.cache.setSpy).toHaveBeenCalledOnce();
    expect(ctx.cache.store.has(CONSEILLER_ID)).toBe(true);
  });

  it('strict=true : bypass le cache même si HIT', async () => {
    seedVerified(ctx.repo);
    ctx.cache.store.set(CONSEILLER_ID, {
      conseillerId: CONSEILLER_ID,
      verified: false, // valeur en cache obsolète volontairement
      lastVerifiedAt: null,
    });

    const result = await ctx.useCase.execute({ conseillerId: CONSEILLER_ID, strict: true });

    expect(result.verified).toBe(true); // valeur fraîche DB
    expect(ctx.cache.getSpy).not.toHaveBeenCalled();
    expect(ctx.cache.setSpy).toHaveBeenCalledOnce(); // refresh cache
  });

  it('conseiller inconnu : retourne verified=false sans erreur', async () => {
    const result = await ctx.useCase.execute({ conseillerId: CONSEILLER_ID });
    expect(result.verified).toBe(false);
    expect(result.lastVerifiedAt).toBeNull();
  });

  it('conseiller anonymisé Loi 25 : retourne verified=false', async () => {
    seedVerified(ctx.repo);
    const compliance = ctx.repo.compliances.get(COMPLIANCE_ID);
    if (!compliance) throw new Error('seed');
    ctx.repo.compliances.set(COMPLIANCE_ID, { ...compliance, anonymizedAt: new Date() });

    const result = await ctx.useCase.execute({ conseillerId: CONSEILLER_ID });
    expect(result.verified).toBe(false);
  });

  it('conseiller suspended : retourne verified=false', async () => {
    seedVerified(ctx.repo);
    const compliance = ctx.repo.compliances.get(COMPLIANCE_ID);
    if (!compliance) throw new Error('seed');
    ctx.repo.compliances.set(COMPLIANCE_ID, { ...compliance, status: 'suspended' });

    const result = await ctx.useCase.execute({ conseillerId: CONSEILLER_ID });
    expect(result.verified).toBe(false);
  });
});
