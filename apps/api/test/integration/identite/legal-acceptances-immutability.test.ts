// T012 — Test d'invariant : auth_legal_acceptances strictement append-only.
//
// Cf. ADR-0008 + specs/004-mentions-legales/data-model.md.
// L'anonymisation Loi 25 passe par INSERT dans la table dédiée
// auth_legal_acceptance_anonymizations, JAMAIS par UPDATE de cette table.

import { type Prisma, prisma } from '@cv/db';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const TEST_DOC_PREFIX = '00000000-0000-4000-8000-1201';
const TEST_ACC_PREFIX = '00000000-0000-4000-8000-1202';

async function cleanup(): Promise<void> {
  await prisma.$executeRawUnsafe(`SET session_replication_role = 'replica'`);
  try {
    await prisma.$executeRawUnsafe(
      `DELETE FROM auth_legal_acceptance_anonymizations WHERE "acceptanceId"::text LIKE '${TEST_ACC_PREFIX}%'`,
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

async function seedDocument(): Promise<void> {
  // LegalDocument requis pour la FK depuis LegalAcceptance (documentType, documentVersion).
  await prisma.legalDocument.create({
    data: {
      id: `${TEST_DOC_PREFIX}00000001`,
      type: 'cgu_b2b',
      version: 999, // version "test" non-conflictuelle
      checksum: 'a'.repeat(64),
      contentSnapshot: '# Test',
      publishedAt: new Date('2026-01-01T00:00:00Z'),
      effectiveAt: new Date('2026-01-01T00:00:00Z'),
    },
  });
}

async function insertAcceptance(suffix: string): Promise<{ id: string }> {
  const id = `${TEST_ACC_PREFIX}${suffix.padStart(8, '0')}`;
  const data: Prisma.LegalAcceptanceUncheckedCreateInput = {
    id,
    subjectType: 'user',
    subjectId: '00000000-0000-4000-8000-cccc00000001',
    documentType: 'cgu_b2b',
    documentVersion: 999,
    acceptedAt: new Date('2026-05-25T12:00:00Z'),
    ipAddress: '192.168.1.42',
    userAgent: 'Mozilla/5.0 test',
  };
  await prisma.legalAcceptance.create({ data });
  return { id };
}

describe('[invariant] auth_legal_acceptances append-only (T012)', () => {
  beforeAll(async () => {
    await cleanup();
    await seedDocument();
  });

  beforeEach(async () => {
    // Cleanup uniquement les acceptances de test, pas le document de seed.
    await prisma.$executeRawUnsafe(`SET session_replication_role = 'replica'`);
    try {
      await prisma.$executeRawUnsafe(
        `DELETE FROM auth_legal_acceptance_anonymizations WHERE "acceptanceId"::text LIKE '${TEST_ACC_PREFIX}%'`,
      );
      await prisma.$executeRawUnsafe(
        `DELETE FROM auth_legal_acceptances WHERE id::text LIKE '${TEST_ACC_PREFIX}%'`,
      );
    } finally {
      await prisma.$executeRawUnsafe(`SET session_replication_role = 'origin'`);
    }
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it('autorise INSERT (cas nominal de AcceptCguB2bUseCase)', async () => {
    const inserted = await insertAcceptance('1');
    const found = await prisma.legalAcceptance.findUnique({ where: { id: inserted.id } });
    expect(found).not.toBeNull();
    expect(found?.subjectType).toBe('user');
  });

  it('REJETTE tout UPDATE avec exception "append-only"', async () => {
    const inserted = await insertAcceptance('2');
    await expect(
      prisma.legalAcceptance.update({
        where: { id: inserted.id },
        data: { ipAddress: '10.0.0.1' },
      }),
    ).rejects.toThrow(/append-only/i);
  });

  it('REJETTE UPDATE même sur les champs PII (subjectId, ipAddress, userAgent)', async () => {
    // Vérifie explicitement que l'anonymisation Loi 25 ne peut PAS passer
    // par UPDATE de cette table — elle DOIT passer par INSERT dans
    // auth_legal_acceptance_anonymizations (ADR-0008).
    const inserted = await insertAcceptance('3');
    await expect(
      prisma.legalAcceptance.update({
        where: { id: inserted.id },
        data: { subjectId: '00000000-0000-4000-8000-dddd00000001' },
      }),
    ).rejects.toThrow(/append-only/i);
  });

  it('REJETTE tout DELETE avec exception "append-only"', async () => {
    const inserted = await insertAcceptance('4');
    await expect(prisma.legalAcceptance.delete({ where: { id: inserted.id } })).rejects.toThrow(
      /append-only/i,
    );
  });

  it('REJETTE UPDATE en masse via updateMany', async () => {
    const inserted = await insertAcceptance('5');
    await expect(
      prisma.legalAcceptance.updateMany({
        where: { id: inserted.id },
        data: { ipAddress: '10.0.0.2' },
      }),
    ).rejects.toThrow(/append-only/i);
  });

  it('REJETTE DELETE en masse via deleteMany', async () => {
    const inserted = await insertAcceptance('6');
    await expect(prisma.legalAcceptance.deleteMany({ where: { id: inserted.id } })).rejects.toThrow(
      /append-only/i,
    );
  });

  it('REJETTE TRUNCATE', async () => {
    await insertAcceptance('7');
    await expect(
      prisma.$executeRawUnsafe('TRUNCATE TABLE auth_legal_acceptances CASCADE'),
    ).rejects.toThrow(/append-only|TRUNCATE rejected/i);
  });
});
