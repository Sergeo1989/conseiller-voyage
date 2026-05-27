// T013 — Test d'invariant : auth_legal_acceptance_anonymizations strictement
// append-only.
//
// Cf. ADR-0008. Une fois qu'une anonymisation Loi 25 est enregistrée, elle
// ne peut plus être modifiée — c'est la preuve que l'effacement a été
// exécuté à un moment donné. Toute mutation post-création doit lever une
// exception.

import { type Prisma, prisma } from '@cv/db';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const TEST_DOC_PREFIX = '00000000-0000-4000-8000-1301';
const TEST_ACC_PREFIX = '00000000-0000-4000-8000-1302';
const TEST_ANON_PREFIX = '00000000-0000-4000-8000-1303';

async function cleanupAll(): Promise<void> {
  await prisma.$executeRawUnsafe(`SET session_replication_role = 'replica'`);
  try {
    await prisma.$executeRawUnsafe(
      `DELETE FROM auth_legal_acceptance_anonymizations WHERE id::text LIKE '${TEST_ANON_PREFIX}%'`,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM auth_legal_acceptances WHERE id::text LIKE '${TEST_ACC_PREFIX}%'`,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM auth_legal_documents WHERE id::text LIKE '${TEST_DOC_PREFIX}%'`,
    );
  } finally {
    await prisma.$executeRawUnsafe(`SET session_replication_role = 'origin'`);
  }
}

async function seedDocAndAcceptance(): Promise<{ acceptanceId: string }> {
  await prisma.legalDocument.create({
    data: {
      id: `${TEST_DOC_PREFIX}00000001`,
      type: 'cgu_b2c',
      version: 999,
      checksum: 'a'.repeat(64),
      contentSnapshot: '# Test',
      publishedAt: new Date('2026-01-01T00:00:00Z'),
      effectiveAt: new Date('2026-01-01T00:00:00Z'),
    },
  });
  const acceptanceId = `${TEST_ACC_PREFIX}00000001`;
  await prisma.legalAcceptance.create({
    data: {
      id: acceptanceId,
      subjectType: 'brief',
      subjectId: '00000000-0000-4000-8000-bbbb00000001',
      documentType: 'cgu_b2c',
      documentVersion: 999,
      acceptedAt: new Date('2026-05-25T12:00:00Z'),
      ipAddress: '203.0.113.42',
      userAgent: 'Mozilla/5.0 test',
    },
  });
  return { acceptanceId };
}

async function insertAnonymization(suffix: string, acceptanceId: string): Promise<{ id: string }> {
  const id = `${TEST_ANON_PREFIX}${suffix.padStart(8, '0')}`;
  const data: Prisma.LegalAcceptanceAnonymizationUncheckedCreateInput = {
    id,
    acceptanceId,
    subjectIdHash: 'a'.repeat(64),
    ipAddressMasked: '203.0.0.0',
    userAgentFamily: 'Firefox',
    anonymizedAt: new Date('2026-06-01T00:00:00Z'),
    anonymizationSaltVersion: 1,
  };
  await prisma.legalAcceptanceAnonymization.create({ data });
  return { id };
}

describe('[invariant] auth_legal_acceptance_anonymizations append-only (T013)', () => {
  let acceptanceId: string;

  beforeAll(async () => {
    await cleanupAll();
    const seeded = await seedDocAndAcceptance();
    acceptanceId = seeded.acceptanceId;
  });

  beforeEach(async () => {
    // Reset anonymizations entre tests (mais garde doc + acceptance seed).
    await prisma.$executeRawUnsafe(`SET session_replication_role = 'replica'`);
    try {
      await prisma.$executeRawUnsafe(
        `DELETE FROM auth_legal_acceptance_anonymizations WHERE id::text LIKE '${TEST_ANON_PREFIX}%'`,
      );
    } finally {
      await prisma.$executeRawUnsafe(`SET session_replication_role = 'origin'`);
    }
  });

  afterAll(async () => {
    await cleanupAll();
    await prisma.$disconnect();
  });

  it('autorise INSERT (cas nominal de AnonymizeLegalAcceptancesUseCase)', async () => {
    const inserted = await insertAnonymization('1', acceptanceId);
    const found = await prisma.legalAcceptanceAnonymization.findUnique({
      where: { id: inserted.id },
    });
    expect(found).not.toBeNull();
    expect(found?.userAgentFamily).toBe('Firefox');
  });

  it("REJETTE l'INSERT d'une 2ème anonymisation pour la même acceptanceId (unique constraint)", async () => {
    await insertAnonymization('2', acceptanceId);
    await expect(
      insertAnonymization('3', acceptanceId), // même acceptanceId
    ).rejects.toThrow();
  });

  it('REJETTE tout UPDATE avec exception "append-only"', async () => {
    const inserted = await insertAnonymization('4', acceptanceId);
    await expect(
      prisma.legalAcceptanceAnonymization.update({
        where: { id: inserted.id },
        data: { subjectIdHash: 'b'.repeat(64) },
      }),
    ).rejects.toThrow(/append-only/i);
  });

  it('REJETTE tout DELETE avec exception "append-only"', async () => {
    const inserted = await insertAnonymization('5', acceptanceId);
    await expect(
      prisma.legalAcceptanceAnonymization.delete({ where: { id: inserted.id } }),
    ).rejects.toThrow(/append-only/i);
  });

  it('REJETTE TRUNCATE', async () => {
    await insertAnonymization('6', acceptanceId);
    await expect(
      prisma.$executeRawUnsafe('TRUNCATE TABLE auth_legal_acceptance_anonymizations CASCADE'),
    ).rejects.toThrow(/append-only|TRUNCATE rejected/i);
  });
});
