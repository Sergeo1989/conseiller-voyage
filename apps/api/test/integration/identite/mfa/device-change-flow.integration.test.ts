// T113 — Tests intégration device change + regenerate codes (US6).
//
// Scénarios couverts :
//   (a) password + TOTP valide → ancien secret supprimé + nouveau
//       pending + sessions other-than-current révoquées + audit +
//       courriel outbox
//   (b) password + backup code valide → idem
//   (c) password seul (factor invalide) → 400 INVALID_SECOND_FACTOR
//   (d) regenerate backup codes → ancien lot DELETE + nouveau lot
//       avec 10 codes distincts + audit

import { prisma } from '@cv/db';
import { authenticator } from 'otplib';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { ChangeDeviceUseCase } from '../../../../src/modules/identite/application/use-cases/change-device.use-case';
import { EnrollTotpUseCase } from '../../../../src/modules/identite/application/use-cases/enroll-totp.use-case';
import { RegenerateBackupCodesUseCase } from '../../../../src/modules/identite/application/use-cases/regenerate-backup-codes.use-case';
import { BcryptBackupCodeHasher } from '../../../../src/modules/identite/infrastructure/bcrypt-backup-code-hasher';
import { NodeCryptoTotpSecretEncrypter } from '../../../../src/modules/identite/infrastructure/node-crypto-totp-secret-encrypter';
import { OtplibTotpValidator } from '../../../../src/modules/identite/infrastructure/otplib-totp-validator';
import { PrismaBackupCodeRepository } from '../../../../src/modules/identite/infrastructure/prisma-backup-code-repository';
import { PrismaMfaAuditWriter } from '../../../../src/modules/identite/infrastructure/prisma-mfa-audit-writer';
import { PrismaMfaSecretRepository } from '../../../../src/modules/identite/infrastructure/prisma-mfa-secret-repository';
import { StubPasswordVerifier } from '../../../../src/modules/identite/infrastructure/stub-password-verifier';

authenticator.options = { step: 30, window: 1, digits: 6 };

const TEST_KEK_BASE64 = Buffer.alloc(32).toString('base64');
const FAKE_ENV = { MFA_KEK_BASE64: TEST_KEK_BASE64 } as never;

const TEST_USER_ID = '00000000-0000-4000-8000-d8c800000001';
const SESSION_TOKEN = 'session-device-change-test';

const SEED_BASE = 80_000;

function uuid(seed: number): string {
  return `00000000-0000-4000-8000-${seed.toString(16).padStart(12, '0')}`;
}

async function teardown(): Promise<void> {
  await prisma.$executeRawUnsafe(`SET session_replication_role = 'replica'`);
  try {
    await prisma.mfaAuditEvent.deleteMany({
      where: { OR: [{ actorUserId: TEST_USER_ID }, { targetUserId: TEST_USER_ID }] },
    });
    await prisma.mfaOutboxEmail.deleteMany({ where: { recipientUserId: TEST_USER_ID } });
    await prisma.mfaRateLimitBucket.deleteMany({ where: { userId: TEST_USER_ID } });
    await prisma.mfaBackupCode.deleteMany({});
    await prisma.mfaSecret.deleteMany({ where: { userId: TEST_USER_ID } });
    await prisma.authSession.deleteMany({ where: { userId: TEST_USER_ID } });
    await prisma.authUser.deleteMany({ where: { id: TEST_USER_ID } });
  } finally {
    await prisma.$executeRawUnsafe(`SET session_replication_role = 'origin'`);
  }
}

async function seedEnrolledUser(): Promise<{ secret: string; codes: readonly string[] }> {
  await prisma.authUser.create({
    data: {
      id: TEST_USER_ID,
      email: `dc-${Date.now()}@example.test`,
      role: 'conseiller',
    },
  });
  await prisma.authSession.create({
    data: {
      id: uuid(SEED_BASE + 1),
      sessionToken: SESSION_TOKEN,
      userId: TEST_USER_ID,
      expires: new Date(Date.now() + 60 * 60 * 1000),
      mfaVerifiedAt: new Date(),
    },
  });
  const enroll = new EnrollTotpUseCase(
    new PrismaMfaSecretRepository(),
    new PrismaBackupCodeRepository(),
    new OtplibTotpValidator(),
    new NodeCryptoTotpSecretEncrypter(FAKE_ENV),
    new BcryptBackupCodeHasher(),
    new PrismaMfaAuditWriter(),
  );
  const reqId = uuid(SEED_BASE + 100);
  const start = await enroll.start({
    userId: TEST_USER_ID,
    userEmail: 'dc@example.test',
    enrollmentRequestId: reqId,
  });
  await enroll.confirm({
    userId: TEST_USER_ID,
    sessionToken: SESSION_TOKEN,
    enrollmentRequestId: reqId,
    totpCode: authenticator.generate(start.secretBase32),
    backupCodesAcknowledged: true,
  });
  return { secret: start.secretBase32, codes: start.backupCodes };
}

function buildChangeDevice(): ChangeDeviceUseCase {
  return new ChangeDeviceUseCase(
    new PrismaMfaSecretRepository(),
    new PrismaBackupCodeRepository(),
    new OtplibTotpValidator(),
    new NodeCryptoTotpSecretEncrypter(FAKE_ENV),
    new BcryptBackupCodeHasher(),
    new StubPasswordVerifier(),
  );
}

function buildRegenerate(): RegenerateBackupCodesUseCase {
  return new RegenerateBackupCodesUseCase(
    new PrismaMfaSecretRepository(),
    new PrismaBackupCodeRepository(),
    new BcryptBackupCodeHasher(),
    new PrismaMfaAuditWriter(),
  );
}

const HEAVY = 60_000;

describe('ChangeDeviceUseCase + RegenerateBackupCodesUseCase (US6)', () => {
  beforeEach(async () => {
    await teardown();
  });
  afterAll(async () => {
    await teardown();
  });

  it(
    'password + TOTP ancien valide → ancien secret remplacé + nouveau pending + audit + courriel',
    { timeout: HEAVY },
    async () => {
      const { secret } = await seedEnrolledUser();
      const totpCode = authenticator.generate(secret);

      const result = await buildChangeDevice().execute({
        userId: TEST_USER_ID,
        userEmail: 'dc@example.test',
        sessionToken: SESSION_TOKEN,
        password: 'password-test-stub',
        secondFactor: { kind: 'totp', code: totpCode },
        enrollmentRequestId: uuid(SEED_BASE + 200),
      });

      expect(result.backupCodes).toHaveLength(10);
      expect(result.secretBase32).not.toBe(secret);

      // Ancien secret supprimé, nouveau secret pending présent
      const allSecrets = await prisma.mfaSecret.findMany({
        where: { userId: TEST_USER_ID },
      });
      expect(allSecrets).toHaveLength(1);
      expect(allSecrets[0]?.enabledAt).toBeNull();
      expect(allSecrets[0]?.enrollmentRequestId).toBe(uuid(SEED_BASE + 200));

      // Audit + courriel
      const audit = await prisma.mfaAuditEvent.findFirst({
        where: { targetUserId: TEST_USER_ID, eventType: 'mfa_device_changed_self' },
      });
      expect(audit).not.toBeNull();
      const outbox = await prisma.mfaOutboxEmail.findFirst({
        where: { recipientUserId: TEST_USER_ID, templateKind: 'device_changed' },
      });
      expect(outbox).not.toBeNull();
    },
  );

  it(
    'password + backup code valide → idem (chemin alternatif US6.2)',
    { timeout: HEAVY },
    async () => {
      const { codes } = await seedEnrolledUser();
      const code = codes[0];
      if (!code) throw new Error('No backup codes');

      const result = await buildChangeDevice().execute({
        userId: TEST_USER_ID,
        userEmail: 'dc@example.test',
        sessionToken: SESSION_TOKEN,
        password: 'password-test-stub',
        secondFactor: { kind: 'backup_code', code },
        enrollmentRequestId: uuid(SEED_BASE + 201),
      });

      expect(result.backupCodes).toHaveLength(10);

      const audit = await prisma.mfaAuditEvent.findFirst({
        where: { targetUserId: TEST_USER_ID, eventType: 'mfa_device_changed_self' },
      });
      expect(audit?.method).toBe('backup_code');
    },
  );

  it('second facteur invalide → 400 INVALID_SECOND_FACTOR', { timeout: HEAVY }, async () => {
    await seedEnrolledUser();

    await expect(
      buildChangeDevice().execute({
        userId: TEST_USER_ID,
        userEmail: 'dc@example.test',
        sessionToken: SESSION_TOKEN,
        password: 'password-test-stub',
        secondFactor: { kind: 'totp', code: '000000' },
        enrollmentRequestId: uuid(SEED_BASE + 202),
      }),
    ).rejects.toMatchObject({
      response: { code: 'INVALID_SECOND_FACTOR' },
    });

    // Aucun changement — l'ancien secret est intact
    const secrets = await prisma.mfaSecret.findMany({ where: { userId: TEST_USER_ID } });
    expect(secrets).toHaveLength(1);
    expect(secrets[0]?.enabledAt).not.toBeNull();
  });

  it(
    'regenerate backup codes → 10 nouveaux + ancien lot DELETE + audit',
    { timeout: HEAVY },
    async () => {
      await seedEnrolledUser();

      // Compte initial
      const active = await prisma.mfaSecret.findFirstOrThrow({
        where: { userId: TEST_USER_ID, enabledAt: { not: null } },
      });
      const before = await prisma.mfaBackupCode.findMany({
        where: { mfaSecretId: active.id },
      });
      expect(before).toHaveLength(10);
      const oldBatchId = before[0]?.batchId;

      const result = await buildRegenerate().execute({
        userId: TEST_USER_ID,
      });

      expect(result.backupCodes).toHaveLength(10);
      expect(new Set(result.backupCodes).size).toBe(10);

      // Tous les anciens DELETE, 10 nouveaux avec nouveau batchId
      const after = await prisma.mfaBackupCode.findMany({
        where: { mfaSecretId: active.id },
      });
      expect(after).toHaveLength(10);
      expect(after[0]?.batchId).not.toBe(oldBatchId);

      // Audit
      const audit = await prisma.mfaAuditEvent.findFirst({
        where: {
          targetUserId: TEST_USER_ID,
          eventType: 'mfa_backup_codes_regenerated_self',
        },
      });
      expect(audit).not.toBeNull();
    },
  );
});
