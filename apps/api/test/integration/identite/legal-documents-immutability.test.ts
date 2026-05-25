// T011 — Test d'invariant : auth_legal_documents strictement immutable.
//
// Cf. ADR-0008 + specs/004-mentions-legales/data-model.md.
// Pattern aligné sur 001 audit-trigger.integration.test.ts.
//
// Le trigger trg_auth_legal_documents_immutable (migration
// 20260525180001_init_legal_immutability) doit rejeter TOUTE mutation
// post-création (UPDATE, DELETE, TRUNCATE) avec un message contenant
// "immutable".

import { type Prisma, prisma } from '@cv/db';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

const TEST_DOC_PREFIX = '00000000-0000-4000-8000-1101';

async function cleanup(): Promise<void> {
  await prisma.$executeRawUnsafe(`SET session_replication_role = 'replica'`);
  try {
    await prisma.$executeRawUnsafe(
      `DELETE FROM auth_legal_documents WHERE id::text LIKE '${TEST_DOC_PREFIX}%'`,
    );
  } finally {
    await prisma.$executeRawUnsafe(`SET session_replication_role = 'origin'`);
  }
}

async function insertDoc(suffix: string): Promise<{ id: string }> {
  const id = `${TEST_DOC_PREFIX}${suffix.padStart(8, '0')}`;
  const data: Prisma.LegalDocumentUncheckedCreateInput = {
    id,
    type: 'cgu_b2b',
    version: Number.parseInt(suffix, 10) || 1,
    checksum: 'a'.repeat(64),
    contentSnapshot: '# Test snapshot',
    publishedAt: new Date('2026-05-25T00:00:00Z'),
    effectiveAt: new Date('2026-06-01T00:00:00Z'),
  };
  await prisma.legalDocument.create({ data });
  return { id };
}

describe('[invariant] auth_legal_documents immutable (T011)', () => {
  beforeEach(async () => {
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it('autorise INSERT (cas nominal du seed-legal-documents.ts)', async () => {
    const inserted = await insertDoc('1');
    const found = await prisma.legalDocument.findUnique({ where: { id: inserted.id } });
    expect(found).not.toBeNull();
    expect(found?.type).toBe('cgu_b2b');
  });

  it('REJETTE tout UPDATE avec exception "immutable"', async () => {
    const inserted = await insertDoc('2');
    await expect(
      prisma.legalDocument.update({
        where: { id: inserted.id },
        data: { checksum: 'b'.repeat(64) },
      }),
    ).rejects.toThrow(/immutable/i);
  });

  it('REJETTE tout DELETE avec exception "immutable"', async () => {
    const inserted = await insertDoc('3');
    await expect(prisma.legalDocument.delete({ where: { id: inserted.id } })).rejects.toThrow(
      /immutable/i,
    );
  });

  it('REJETTE UPDATE en masse via updateMany', async () => {
    const inserted = await insertDoc('4');
    await expect(
      prisma.legalDocument.updateMany({
        where: { id: inserted.id },
        data: { checksum: 'c'.repeat(64) },
      }),
    ).rejects.toThrow(/immutable/i);
  });

  it('REJETTE DELETE en masse via deleteMany', async () => {
    const inserted = await insertDoc('5');
    await expect(prisma.legalDocument.deleteMany({ where: { id: inserted.id } })).rejects.toThrow(
      /immutable/i,
    );
  });

  it('REJETTE TRUNCATE (FK + trigger STATEMENT-level)', async () => {
    await insertDoc('6');
    // TRUNCATE est covered par deux mécanismes :
    //   1. Foreign key constraint depuis auth_legal_acceptances refuse
    //      TRUNCATE sans CASCADE (1ère ligne de défense).
    //   2. Trigger STATEMENT-level "auth_legal_block_truncate" sur la
    //      table (couvre le cas CASCADE qui contournerait la FK).
    // L'erreur peut venir de l'un ou l'autre — les deux sont acceptables.
    await expect(
      prisma.$executeRawUnsafe('TRUNCATE TABLE auth_legal_documents CASCADE'),
    ).rejects.toThrow(/append-only|TRUNCATE rejected|foreign key/i);
  });
});
