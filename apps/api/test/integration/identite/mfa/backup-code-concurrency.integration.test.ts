// T057 — Test P0-5 du review : consumeAtomic empêche la double consommation
// d'un même code de récupération sous requêtes parallèles.
//
// Stratégie : 2 (puis 10) coroutines parallèles tentent de consommer le
// même code. Exactement UNE doit retourner true.

import { prisma } from '@cv/db';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { BackupCodeHash } from '../../../../src/modules/identite/domain/value-objects/backup-code-hash.vo';
import { PrismaBackupCodeRepository } from '../../../../src/modules/identite/infrastructure/prisma-backup-code-repository';

const TEST_USER_ID = '00000000-0000-4000-8000-bccc00000001';
const TEST_SECRET_ID = '00000000-0000-4000-8000-bccc00000002';

async function setup(): Promise<{ codeId: string }> {
  // Cleanup
  await prisma.$executeRawUnsafe(`SET session_replication_role = 'replica'`);
  try {
    await prisma.mfaBackupCode.deleteMany({ where: { mfaSecretId: TEST_SECRET_ID } });
    await prisma.mfaSecret.deleteMany({ where: { id: TEST_SECRET_ID } });
    await prisma.authSession.deleteMany({ where: { userId: TEST_USER_ID } });
    await prisma.authUser.deleteMany({ where: { id: TEST_USER_ID } });
  } finally {
    await prisma.$executeRawUnsafe(`SET session_replication_role = 'origin'`);
  }

  // User + secret + 1 code
  await prisma.authUser.create({
    data: {
      id: TEST_USER_ID,
      email: `bcc-${Date.now()}@example.test`,
      role: 'conseiller',
    },
  });
  await prisma.mfaSecret.create({
    data: {
      id: TEST_SECRET_ID,
      userId: TEST_USER_ID,
      encryptedSecret: 'stub-encrypted',
      enrollmentRequestId: '00000000-0000-4000-8000-bccc00000003',
      enabledAt: new Date(),
    },
  });
  const code = await prisma.mfaBackupCode.create({
    data: {
      mfaSecretId: TEST_SECRET_ID,
      codeHash: 'stub-bcrypt-hash' as BackupCodeHash,
      batchId: '00000000-0000-4000-8000-bccc00000004',
      position: 1,
    },
  });
  return { codeId: code.id };
}

async function teardown(): Promise<void> {
  await prisma.$executeRawUnsafe(`SET session_replication_role = 'replica'`);
  try {
    await prisma.mfaBackupCode.deleteMany({ where: { mfaSecretId: TEST_SECRET_ID } });
    await prisma.mfaSecret.deleteMany({ where: { id: TEST_SECRET_ID } });
    await prisma.authSession.deleteMany({ where: { userId: TEST_USER_ID } });
    await prisma.authUser.deleteMany({ where: { id: TEST_USER_ID } });
  } finally {
    await prisma.$executeRawUnsafe(`SET session_replication_role = 'origin'`);
  }
}

describe('PrismaBackupCodeRepository.consumeAtomic (P0-5)', () => {
  const repo = new PrismaBackupCodeRepository();

  beforeEach(async () => {
    await teardown();
  });
  afterAll(async () => {
    await teardown();
  });

  it('2 consommations parallèles → 1 seule réussit', async () => {
    const { codeId } = await setup();
    const [a, b] = await Promise.all([repo.consumeAtomic(codeId), repo.consumeAtomic(codeId)]);
    const successCount = [a, b].filter(Boolean).length;
    expect(successCount).toBe(1);
  });

  it('10 consommations parallèles → 1 seule réussit', async () => {
    const { codeId } = await setup();
    const results = await Promise.all(Array.from({ length: 10 }, () => repo.consumeAtomic(codeId)));
    const successCount = results.filter(Boolean).length;
    expect(successCount).toBe(1);
  });

  it('consumption séquentielle : 1ère true, 2ème false', async () => {
    const { codeId } = await setup();
    const first = await repo.consumeAtomic(codeId);
    const second = await repo.consumeAtomic(codeId);
    expect(first).toBe(true);
    expect(second).toBe(false);
  });

  it('code inexistant → false', async () => {
    await setup();
    const result = await repo.consumeAtomic('00000000-0000-4000-8000-bccc00000009');
    expect(result).toBe(false);
  });
});
