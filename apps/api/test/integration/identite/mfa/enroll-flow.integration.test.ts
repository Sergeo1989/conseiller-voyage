// T064 — Test intégration du flow d'enrôlement complet US1.
//
// Scénarios :
//   (a) start → confirm avec code TOTP valide → enabledAt set + mfaVerifiedAt posé
//   (b) start sans confirm → un nouveau start supersede l'ancien pending
//   (c) confirm avec code invalide → 400 INVALID_TOTP
//   (d) confirm avec backupCodesAcknowledged absent → 400 (validation Zod)
//   (e) start après enrollement actif → 409 MFA_ALREADY_ENROLLED

import { prisma } from '@cv/db';
import { authenticator } from 'otplib';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { EnrollTotpUseCase } from '../../../../src/modules/identite/application/use-cases/enroll-totp.use-case';
import { BcryptBackupCodeHasher } from '../../../../src/modules/identite/infrastructure/bcrypt-backup-code-hasher';
import { NodeCryptoTotpSecretEncrypter } from '../../../../src/modules/identite/infrastructure/node-crypto-totp-secret-encrypter';
import { OtplibTotpValidator } from '../../../../src/modules/identite/infrastructure/otplib-totp-validator';
import { PrismaBackupCodeRepository } from '../../../../src/modules/identite/infrastructure/prisma-backup-code-repository';
import { PrismaMfaAuditWriter } from '../../../../src/modules/identite/infrastructure/prisma-mfa-audit-writer';
import { PrismaMfaSecretRepository } from '../../../../src/modules/identite/infrastructure/prisma-mfa-secret-repository';

// Aligne otplib pour les tests (mêmes options que packages/mfa/src/totp.ts).
authenticator.options = { step: 30, window: 1, digits: 6 };

// KEK de test déterministe (32 octets de zéro base64). Cohérent avec
// la valeur CI utilisée par .github/workflows/ci.yml.
const TEST_KEK_BASE64 = Buffer.alloc(32).toString('base64');
const FAKE_ENV = { MFA_KEK_BASE64: TEST_KEK_BASE64 } as never;

const TEST_USER_ID = '00000000-0000-4000-8000-eeee00000001';
const TEST_SESSION_ID = '00000000-0000-4000-8000-eeee00000002';
const TEST_SESSION_TOKEN = 'test-session-token-enrollment-001';

function uuid(seed: number): string {
  return `00000000-0000-4000-8000-${seed.toString(16).padStart(12, '0')}`;
}

async function teardown(): Promise<void> {
  await prisma.$executeRawUnsafe(`SET session_replication_role = 'replica'`);
  try {
    await prisma.mfaAuditEvent.deleteMany({
      where: {
        OR: [{ actorUserId: TEST_USER_ID }, { targetUserId: TEST_USER_ID }],
      },
    });
    await prisma.mfaBackupCode.deleteMany({});
    await prisma.mfaSecret.deleteMany({ where: { userId: TEST_USER_ID } });
    await prisma.authSession.deleteMany({ where: { userId: TEST_USER_ID } });
    await prisma.authUser.deleteMany({ where: { id: TEST_USER_ID } });
  } finally {
    await prisma.$executeRawUnsafe(`SET session_replication_role = 'origin'`);
  }
}

async function setupUser(): Promise<void> {
  await teardown();
  await prisma.authUser.create({
    data: {
      id: TEST_USER_ID,
      email: `enroll-${Date.now()}@example.test`,
      role: 'conseiller',
    },
  });
  await prisma.authSession.create({
    data: {
      id: TEST_SESSION_ID,
      sessionToken: TEST_SESSION_TOKEN,
      userId: TEST_USER_ID,
      expires: new Date(Date.now() + 60 * 60 * 1000),
    },
  });
}

function buildUseCase(): EnrollTotpUseCase {
  const secrets = new PrismaMfaSecretRepository();
  const backupCodes = new PrismaBackupCodeRepository();
  const totpValidator = new OtplibTotpValidator();
  const encrypter = new NodeCryptoTotpSecretEncrypter(FAKE_ENV);
  const hasher = new BcryptBackupCodeHasher();
  const audit = new PrismaMfaAuditWriter();
  return new EnrollTotpUseCase(secrets, backupCodes, totpValidator, encrypter, hasher, audit);
}

// Timeout étendu pour les tests qui font N hash bcrypt cost 12 (~250ms
// × 10 codes ≈ 2.5s par start) + transactions Prisma.
const HEAVY_TEST_TIMEOUT_MS = 30_000;

describe('EnrollTotpUseCase flow (US1)', () => {
  const useCase = buildUseCase();

  beforeEach(async () => {
    await setupUser();
  });
  afterAll(async () => {
    await teardown();
  });

  it(
    'start + confirm avec TOTP valide → enabledAt + mfaVerifiedAt posés',
    { timeout: HEAVY_TEST_TIMEOUT_MS },
    async () => {
      const reqId = uuid(101);

      const startResult = await useCase.start({
        userId: TEST_USER_ID,
        userEmail: 'test@example.test',
        enrollmentRequestId: reqId,
      });

      expect(startResult.secretBase32).toMatch(/^[A-Z2-7]+$/);
      expect(startResult.backupCodes).toHaveLength(10);
      expect(startResult.keyUri).toMatch(/^otpauth:\/\/totp\//);

      // Génère le code TOTP courant pour ce secret.
      const totpCode = authenticator.generate(startResult.secretBase32);

      const confirmResult = await useCase.confirm({
        userId: TEST_USER_ID,
        sessionToken: TEST_SESSION_TOKEN,
        enrollmentRequestId: reqId,
        totpCode,
        backupCodesAcknowledged: true,
      });

      expect(confirmResult.enabledAt).toBeInstanceOf(Date);

      // Vérif side effects
      const secret = await prisma.mfaSecret.findFirst({ where: { userId: TEST_USER_ID } });
      expect(secret?.enabledAt).not.toBeNull();

      const session = await prisma.authSession.findUnique({
        where: { sessionToken: TEST_SESSION_TOKEN },
      });
      expect(session?.mfaVerifiedAt).not.toBeNull();

      // Audit
      const events = await prisma.mfaAuditEvent.findMany({
        where: { targetUserId: TEST_USER_ID },
        orderBy: { occurredAt: 'asc' },
      });
      expect(events.map((e) => e.eventType)).toEqual(['mfa_enrollment_started', 'mfa_enrolled']);
    },
  );

  it(
    'start sans confirm → 2ème start supersede (nouveau secret, nouveaux codes)',
    { timeout: HEAVY_TEST_TIMEOUT_MS },
    async () => {
      const reqId1 = uuid(201);
      const reqId2 = uuid(202);

      const first = await useCase.start({
        userId: TEST_USER_ID,
        userEmail: 'test@example.test',
        enrollmentRequestId: reqId1,
      });
      const second = await useCase.start({
        userId: TEST_USER_ID,
        userEmail: 'test@example.test',
        enrollmentRequestId: reqId2,
      });

      expect(first.secretBase32).not.toBe(second.secretBase32);

      // Il n'y a plus que le 2ème secret en BD
      const allSecrets = await prisma.mfaSecret.findMany({
        where: { userId: TEST_USER_ID },
      });
      expect(allSecrets).toHaveLength(1);
      expect(allSecrets[0]?.enrollmentRequestId).toBe(reqId2);
    },
  );

  it(
    'confirm avec code TOTP invalide → 400 INVALID_TOTP',
    { timeout: HEAVY_TEST_TIMEOUT_MS },
    async () => {
      const reqId = uuid(301);
      await useCase.start({
        userId: TEST_USER_ID,
        userEmail: 'test@example.test',
        enrollmentRequestId: reqId,
      });

      await expect(
        useCase.confirm({
          userId: TEST_USER_ID,
          sessionToken: TEST_SESSION_TOKEN,
          enrollmentRequestId: reqId,
          totpCode: '000000', // quasi-certain d'être invalide
          backupCodesAcknowledged: true,
        }),
      ).rejects.toMatchObject({
        response: { code: 'INVALID_TOTP' },
      });

      // Pas d'enabledAt posé
      const secret = await prisma.mfaSecret.findFirst({ where: { userId: TEST_USER_ID } });
      expect(secret?.enabledAt).toBeNull();
    },
  );

  it(
    'confirm avec backupCodesAcknowledged manquant → BadRequest',
    { timeout: HEAVY_TEST_TIMEOUT_MS },
    async () => {
      const reqId = uuid(401);
      const startResult = await useCase.start({
        userId: TEST_USER_ID,
        userEmail: 'test@example.test',
        enrollmentRequestId: reqId,
      });
      const totpCode = authenticator.generate(startResult.secretBase32);

      await expect(
        useCase.confirm({
          userId: TEST_USER_ID,
          sessionToken: TEST_SESSION_TOKEN,
          enrollmentRequestId: reqId,
          totpCode,
          // biome-ignore lint/suspicious/noExplicitAny: test type cast pour simuler input invalide
          backupCodesAcknowledged: false as any,
        }),
      ).rejects.toMatchObject({
        response: { code: 'BACKUP_CODES_NOT_ACKNOWLEDGED' },
      });
    },
  );

  it(
    'start après MFA actif → 409 MFA_ALREADY_ENROLLED',
    { timeout: HEAVY_TEST_TIMEOUT_MS },
    async () => {
      const reqId = uuid(501);
      const startResult = await useCase.start({
        userId: TEST_USER_ID,
        userEmail: 'test@example.test',
        enrollmentRequestId: reqId,
      });
      const totpCode = authenticator.generate(startResult.secretBase32);
      await useCase.confirm({
        userId: TEST_USER_ID,
        sessionToken: TEST_SESSION_TOKEN,
        enrollmentRequestId: reqId,
        totpCode,
        backupCodesAcknowledged: true,
      });

      // Re-tenter un start → 409
      await expect(
        useCase.start({
          userId: TEST_USER_ID,
          userEmail: 'test@example.test',
          enrollmentRequestId: uuid(502),
        }),
      ).rejects.toMatchObject({
        response: { code: 'MFA_ALREADY_ENROLLED' },
      });
    },
  );
});
