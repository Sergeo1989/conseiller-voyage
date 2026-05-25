// F1 — Tests unitaires du filtre matériel verified (FR-007 / U1).
//
// Couvre la SÉMANTIQUE attendue de listVerifiedCompliances() et
// findVerifiedByConseillerId() — exécutée ici contre le fake repo.
// Le test d'intégration équivalent contre PrismaConformiteRepository
// (T081a) vérifie le même contrat contre une vraie DB Postgres.

import { ConseillerComplianceIdSchema, ConseillerIdSchema } from '@cv/shared/conformite';
import { beforeEach, describe, expect, it } from 'vitest';
import type { ConseillerCompliance } from '../../domain/entities/conseiller-compliance.entity';
import type { ConformiteStatus } from '../../domain/value-objects/conformite-status.vo';
import { FakeConformiteRepository } from './_fakes';

const NOW = new Date('2026-05-24T12:00:00Z');

function makeCompliance(
  conseillerSuffix: string,
  status: ConformiteStatus,
  options: { anonymizedAt?: Date | null } = {},
): ConseillerCompliance {
  return {
    id: ConseillerComplianceIdSchema.parse(
      `00000000-0000-4000-8000-${conseillerSuffix.padStart(12, 'a')}`,
    ),
    conseillerId: ConseillerIdSchema.parse(
      `00000000-0000-4000-8000-${conseillerSuffix.padStart(12, '0')}`,
    ),
    status,
    lastVerifiedAt: status === 'verified' ? NOW : null,
    lastStatusChangeAt: NOW,
    consentToProcessGivenAt: NOW,
    erasureRequestedAt: null,
    anonymizedAt: options.anonymizedAt ?? null,
  };
}

function seedAll(repo: FakeConformiteRepository): {
  verified: ConseillerCompliance;
  suspended: ConseillerCompliance;
  revoked: ConseillerCompliance;
  anonymizedVerified: ConseillerCompliance;
} {
  const verified = makeCompliance('001', 'verified');
  const suspended = makeCompliance('002', 'suspended');
  const revoked = makeCompliance('003', 'revoked');
  // Un conseiller dont le dossier a été effacé Loi 25 :
  // status='verified' MAIS anonymizedAt !== null → DOIT être filtré
  const anonymizedVerified = makeCompliance('004', 'verified', { anonymizedAt: NOW });

  for (const c of [verified, suspended, revoked, anonymizedVerified]) {
    repo.compliances.set(c.id, c);
    repo.compliancesByConseillerId.set(c.conseillerId, c.id);
  }
  return { verified, suspended, revoked, anonymizedVerified };
}

describe('listVerifiedCompliances — FR-007 filtre matériel (U1)', () => {
  let repo: FakeConformiteRepository;

  beforeEach(() => {
    repo = new FakeConformiteRepository();
  });

  it('retourne uniquement les compliances avec status=verified et anonymizedAt=null', async () => {
    const seeded = seedAll(repo);
    const result = await repo.listVerifiedCompliances();

    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe(seeded.verified.id);
  });

  it('exclut les pending', async () => {
    const pending = makeCompliance('010', 'pending');
    repo.compliances.set(pending.id, pending);
    repo.compliancesByConseillerId.set(pending.conseillerId, pending.id);

    const result = await repo.listVerifiedCompliances();
    expect(result).toHaveLength(0);
  });

  it('exclut les suspended', async () => {
    const suspended = makeCompliance('011', 'suspended');
    repo.compliances.set(suspended.id, suspended);
    repo.compliancesByConseillerId.set(suspended.conseillerId, suspended.id);

    const result = await repo.listVerifiedCompliances();
    expect(result).toHaveLength(0);
  });

  it('exclut les revoked', async () => {
    const revoked = makeCompliance('012', 'revoked');
    repo.compliances.set(revoked.id, revoked);
    repo.compliancesByConseillerId.set(revoked.conseillerId, revoked.id);

    const result = await repo.listVerifiedCompliances();
    expect(result).toHaveLength(0);
  });

  it('exclut les verified anonymisés (Loi 25 effacement)', async () => {
    const anonVerified = makeCompliance('013', 'verified', { anonymizedAt: NOW });
    repo.compliances.set(anonVerified.id, anonVerified);
    repo.compliancesByConseillerId.set(anonVerified.conseillerId, anonVerified.id);

    const result = await repo.listVerifiedCompliances();
    expect(result).toHaveLength(0);
  });

  it('retourne un tableau vide quand aucune compliance verified existe', async () => {
    const result = await repo.listVerifiedCompliances();
    expect(result).toEqual([]);
  });
});

describe('findVerifiedByConseillerId — FR-007 filtre matériel (U1)', () => {
  let repo: FakeConformiteRepository;

  beforeEach(() => {
    repo = new FakeConformiteRepository();
  });

  it('retourne la compliance si conseiller verified', async () => {
    const seeded = seedAll(repo);
    const result = await repo.findVerifiedByConseillerId(seeded.verified.conseillerId);
    expect(result?.id).toBe(seeded.verified.id);
  });

  it('retourne null si conseiller suspended (filtré comme non-trouvé)', async () => {
    const seeded = seedAll(repo);
    const result = await repo.findVerifiedByConseillerId(seeded.suspended.conseillerId);
    expect(result).toBeNull();
  });

  it('retourne null si conseiller revoked (filtré comme non-trouvé)', async () => {
    const seeded = seedAll(repo);
    const result = await repo.findVerifiedByConseillerId(seeded.revoked.conseillerId);
    expect(result).toBeNull();
  });

  it('retourne null si conseiller verified mais anonymisé', async () => {
    const seeded = seedAll(repo);
    const result = await repo.findVerifiedByConseillerId(seeded.anonymizedVerified.conseillerId);
    expect(result).toBeNull();
  });

  it("retourne null si conseiller n'existe pas du tout", async () => {
    const unknown = ConseillerIdSchema.parse('00000000-0000-4000-8000-000000000ffe');
    const result = await repo.findVerifiedByConseillerId(unknown);
    expect(result).toBeNull();
  });
});
