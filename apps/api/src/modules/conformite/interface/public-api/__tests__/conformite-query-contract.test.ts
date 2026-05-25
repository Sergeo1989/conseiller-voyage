// T098 — Contract test ConformiteQueryFacade.
//
// Vérifie que la facade respecte le contrat ConformiteQueryPort exposé
// dans @cv/shared/conformite. Test unitaire avec fakes — pas d'I/O DB
// ni Redis ; le contract test "réel" (intégration) sera ajouté quand
// testcontainers sera installé.

import {
  type ConformiteQueryPort,
  ConseillerComplianceIdSchema,
  ConseillerIdSchema,
} from '@cv/shared/conformite';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeConformiteRepository } from '../../../application/__tests__/_fakes';
import type {
  ConformiteDomainEvent,
  ConformiteEventPublisher,
  EventHandler,
  Unsubscribe,
} from '../../../application/ports/conformite-event-publisher.port';
import type {
  ConformiteStatusCache,
  VerificationStatus,
} from '../../../application/ports/conformite-status-cache.port';
import { GetVerificationStatusUseCase } from '../../../application/use-cases/get-verification-status.use-case';
import { ConformiteQueryFacade } from '../conformite-query.facade';

const CONSEILLER_ID = ConseillerIdSchema.parse('00000000-0000-4000-8000-cccc00000001');
const COMPLIANCE_ID = ConseillerComplianceIdSchema.parse('00000000-0000-4000-8000-aaaa00000001');

class FakeCache implements ConformiteStatusCache {
  public readonly store = new Map<string, VerificationStatus>();
  public readonly invalidateSpy = vi.fn<(id: string) => Promise<void>>();
  async get(id: string): Promise<VerificationStatus | null> {
    return this.store.get(id) ?? null;
  }
  async set(s: VerificationStatus): Promise<void> {
    this.store.set(s.conseillerId, s);
  }
  async invalidate(id: string): Promise<void> {
    this.invalidateSpy(id);
    this.store.delete(id);
  }
}

class FakePublisher implements ConformiteEventPublisher {
  public readonly handlers: EventHandler[] = [];
  async publish(_event: ConformiteDomainEvent): Promise<void> {
    /* noop pour les tests contract */
  }
  subscribe(handler: EventHandler): Unsubscribe {
    this.handlers.push(handler);
    return () => {
      const i = this.handlers.indexOf(handler);
      if (i >= 0) this.handlers.splice(i, 1);
    };
  }
  emit(event: ConformiteDomainEvent): void {
    for (const h of this.handlers) void h(event);
  }
}

function makeFacade(): {
  facade: ConformiteQueryFacade;
  repo: FakeConformiteRepository;
  cache: FakeCache;
  publisher: FakePublisher;
} {
  const repo = new FakeConformiteRepository();
  const cache = new FakeCache();
  const publisher = new FakePublisher();
  const useCase = new GetVerificationStatusUseCase(repo, cache);
  const facade = new ConformiteQueryFacade(useCase, publisher, cache);
  facade.onModuleInit();
  return { facade, repo, cache, publisher };
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

describe('ConformiteQueryFacade — contract ConformiteQueryPort (T098)', () => {
  let ctx: ReturnType<typeof makeFacade>;

  beforeEach(() => {
    ctx = makeFacade();
  });

  it('expose un objet conforme au contrat ConformiteQueryPort', () => {
    const port: ConformiteQueryPort = ctx.facade;
    expect(typeof port.getVerificationStatus).toBe('function');
    expect(typeof port.onStatusChanged).toBe('function');
  });

  it('getVerificationStatus retourne VerificationStatusDto avec ISO date', async () => {
    seedVerified(ctx.repo);
    const result = await ctx.facade.getVerificationStatus({ conseillerId: CONSEILLER_ID });
    expect(result.conseillerId).toBe(CONSEILLER_ID);
    expect(result.verified).toBe(true);
    expect(result.lastVerifiedAt).toContain('2026-05-01');
  });

  it('strict=true bypass le cache (forward au use case)', async () => {
    seedVerified(ctx.repo);
    ctx.cache.store.set(CONSEILLER_ID, {
      conseillerId: CONSEILLER_ID,
      verified: false, // valeur obsolète en cache
      lastVerifiedAt: null,
    });
    const result = await ctx.facade.getVerificationStatus({
      conseillerId: CONSEILLER_ID,
      strict: true,
    });
    expect(result.verified).toBe(true);
  });

  it('invalide automatiquement le cache sur événement status.changed', async () => {
    ctx.cache.store.set(CONSEILLER_ID, {
      conseillerId: CONSEILLER_ID,
      verified: true,
      lastVerifiedAt: new Date('2026-05-01'),
    });

    ctx.publisher.emit({
      type: 'conformite.status.changed',
      conseillerId: CONSEILLER_ID,
      previousStatus: 'verified',
      newStatus: 'suspended',
      transitionKind: 'negative',
      cause: 'certificate_expiration',
      occurredAt: new Date(),
      correlationId: 'test',
    });

    // Laisse le tick async passer
    await new Promise((resolve) => setImmediate(resolve));
    expect(ctx.cache.invalidateSpy).toHaveBeenCalledWith(CONSEILLER_ID);
  });

  it("onStatusChanged forward bien l'événement au handler externe", async () => {
    const handler = vi.fn();
    ctx.facade.onStatusChanged(handler);

    ctx.publisher.emit({
      type: 'conformite.status.changed',
      conseillerId: CONSEILLER_ID,
      previousStatus: 'verified',
      newStatus: 'suspended',
      transitionKind: 'negative',
      cause: 'permit_cascade',
      occurredAt: new Date(),
      correlationId: 'test',
    });

    await new Promise((resolve) => setImmediate(resolve));
    expect(handler).toHaveBeenCalledOnce();
    expect(handler.mock.calls[0]?.[0].newStatus).toBe('suspended');
  });
});
