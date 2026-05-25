// T081a [invariant] — FR-007 / U1 du review.
//
// Test d'intégration Prisma : crée des compliances avec différents
// statuts dans une vraie DB Postgres, et vérifie que
// PrismaConformiteRepository.listVerifiedCompliances() / findVerifiedByConseillerId()
// retourne UNIQUEMENT les conseillers verified ET non-anonymisés.
//
// Ce test EST l'invariant constitutionnel — il ne peut pas être
// supprimé sans amendement de la constitution + ADR. Toute régression
// fait sauter la barrière qui sépare un conseiller suspendu/révoqué
// d'une exposition publique (matching, SEO, port public US3).
//
// TODO(testcontainers) : remplacer la dépendance DATABASE_URL fixe par
// un container PG éphémère via @testcontainers/postgresql, pour
// pouvoir lancer ces tests en CI sans infra partagée.

import { type Prisma, prisma } from '@cv/db';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaConformiteRepository } from '../../../src/modules/conformite/infrastructure/prisma-conformite-repository';

const repo = new PrismaConformiteRepository();

// Préfixes d'UUID pour pouvoir nettoyer uniquement nos rows
// (cas où la DB de dev contient d'autres données).
const TEST_PREFIX = '00000000-0000-4000-8000-aaaa';

async function cleanup(): Promise<void> {
  // `startsWith` n'est pas supporté sur les colonnes UUID Postgres
  // (type binaire 16 octets). On bascule sur du SQL natif avec
  // `id::text LIKE` qui cast l'UUID en string côté DB. Même pattern
  // qu'utilisé par audit-trigger.integration.test.ts:36.
  // Nom de table : @@map("conformite_conseiller_compliances") dans le schéma.
  await prisma.$executeRawUnsafe(
    `DELETE FROM conformite_conseiller_compliances WHERE id::text LIKE '${TEST_PREFIX}%'`,
  );
}

async function seedCompliance(
  suffix: string,
  status: 'pending' | 'verified' | 'suspended' | 'revoked',
  options: { anonymizedAt?: Date | null } = {},
): Promise<{ id: string; conseillerId: string }> {
  // Les colonnes id sont en @db.Uuid → 5e groupe doit faire 12 chars.
  // Préfixe 4 chars + suffix padStart 8 = 12.
  const id = `${TEST_PREFIX}${suffix.padStart(8, '0')}`;
  const conseillerId = `00000000-0000-4000-8000-cccc${suffix.padStart(8, '0')}`;
  const data: Prisma.ConseillerComplianceUncheckedCreateInput = {
    id,
    conseillerId,
    status,
    lastVerifiedAt: status === 'verified' ? new Date() : null,
    lastStatusChangeAt: new Date(),
    consentToProcessGivenAt: new Date(),
    erasureRequestedAt: null,
    anonymizedAt: options.anonymizedAt ?? null,
  };
  await prisma.conseillerCompliance.create({ data });
  return { id, conseillerId };
}

describe('[invariant] PrismaConformiteRepository.listVerifiedCompliances (T081a)', () => {
  beforeEach(async () => {
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it('retourne uniquement le conseiller verified parmi {verified, suspended, revoked}', async () => {
    const verified = await seedCompliance('0001', 'verified');
    await seedCompliance('0002', 'suspended');
    await seedCompliance('0003', 'revoked');

    const result = await repo.listVerifiedCompliances();
    const ourResults = result.filter((c) => c.id.startsWith(TEST_PREFIX));

    expect(ourResults).toHaveLength(1);
    expect(ourResults[0]?.id).toBe(verified.id);
  });

  it('exclut un conseiller verified mais anonymizedAt non-null (Loi 25)', async () => {
    await seedCompliance('0010', 'verified', { anonymizedAt: new Date() });

    const result = await repo.listVerifiedCompliances();
    const ourResults = result.filter((c) => c.id.startsWith(TEST_PREFIX));

    expect(ourResults).toHaveLength(0);
  });

  it('inclut bien le verified non-anonymisé même mêlé à anonymisé', async () => {
    const verified = await seedCompliance('0020', 'verified');
    await seedCompliance('0021', 'verified', { anonymizedAt: new Date() });

    const result = await repo.listVerifiedCompliances();
    const ourResults = result.filter((c) => c.id.startsWith(TEST_PREFIX));

    expect(ourResults).toHaveLength(1);
    expect(ourResults[0]?.id).toBe(verified.id);
  });
});

describe('[invariant] PrismaConformiteRepository.findVerifiedByConseillerId (T081a)', () => {
  beforeEach(async () => {
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it('retourne la compliance si conseiller verified non-anonymisé', async () => {
    const seeded = await seedCompliance('0001', 'verified');
    // biome-ignore lint/suspicious/noExplicitAny: branded id cast for test
    const result = await repo.findVerifiedByConseillerId(seeded.conseillerId as any);
    expect(result?.id).toBe(seeded.id);
  });

  it('retourne null pour conseiller suspended', async () => {
    const seeded = await seedCompliance('0002', 'suspended');
    // biome-ignore lint/suspicious/noExplicitAny: branded id cast for test
    const result = await repo.findVerifiedByConseillerId(seeded.conseillerId as any);
    expect(result).toBeNull();
  });

  it('retourne null pour conseiller revoked', async () => {
    const seeded = await seedCompliance('0003', 'revoked');
    // biome-ignore lint/suspicious/noExplicitAny: branded id cast for test
    const result = await repo.findVerifiedByConseillerId(seeded.conseillerId as any);
    expect(result).toBeNull();
  });

  it('retourne null pour conseiller verified mais anonymisé', async () => {
    const seeded = await seedCompliance('0004', 'verified', { anonymizedAt: new Date() });
    // biome-ignore lint/suspicious/noExplicitAny: branded id cast for test
    const result = await repo.findVerifiedByConseillerId(seeded.conseillerId as any);
    expect(result).toBeNull();
  });
});
