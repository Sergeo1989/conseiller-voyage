// T089 — Tests intégration verify TOTP + backup code (US3).
//
// Scénarios couverts :
//   (a) verify TOTP valide → mfaVerifiedAt posé + audit mfa_login_verified
//   (b) verify TOTP invalide → kind invalid + bucket login_totp ++ + audit
//   (c) 5 échecs TOTP → kind locked + audit mfa_login_locked + courriel outbox
//   (d) verify backup code valide → consumeAtomic + remainingCount + audit
//   (e) verify backup code déjà consommé → kind invalid
//   (f) backup code warnLowCodes à 2 codes restants → audit warning_low émis

import { prisma } from '@cv/db';
import { authenticator } from 'otplib';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { EnrollTotpUseCase } from '../../../../src/modules/identite/application/use-cases/enroll-totp.use-case';
import { VerifyBackupCodeUseCase } from '../../../../src/modules/identite/application/use-cases/verify-backup-code.use-case';
import { VerifyTotpUseCase } from '../../../../src/modules/identite/application/use-cases/verify-totp.use-case';
import { BcryptBackupCodeHasher } from '../../../../src/modules/identite/infrastructure/bcrypt-backup-code-hasher';
import { NodeCryptoTotpSecretEncrypter } from '../../../../src/modules/identite/infrastructure/node-crypto-totp-secret-encrypter';
import { OtplibTotpValidator } from '../../../../src/modules/identite/infrastructure/otplib-totp-validator';
import { PostgresMfaRateLimiter } from '../../../../src/modules/identite/infrastructure/postgres-mfa-rate-limiter';
import { PrismaBackupCodeRepository } from '../../../../src/modules/identite/infrastructure/prisma-backup-code-repository';
import { PrismaMfaAuditWriter } from '../../../../src/modules/identite/infrastructure/prisma-mfa-audit-writer';
import { PrismaMfaSecretRepository } from '../../../../src/modules/identite/infrastructure/prisma-mfa-secret-repository';
import { SesMfaNotificationMailer } from '../../../../src/modules/identite/infrastructure/ses-mfa-notification-mailer';

authenticator.options = { step: 30, window: 1, digits: 6 };

const TEST_KEK_BASE64 = Buffer.alloc(32).toString('base64');
const FAKE_ENV = { MFA_KEK_BASE64: TEST_KEK_BASE64 } as never;

const TEST_USER_ID = '00000000-0000-4000-8000-eee500000001';
const TEST_SESSION_ID = '00000000-0000-4000-8000-eee500000002';
const TEST_SESSION_TOKEN = 'test-session-token-verify';

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

interface SeedResult {
  readonly secretBase32: string;
  readonly backupCodes: readonly string[];
}

async function seedEnrolledUser(): Promise<SeedResult> {
  await prisma.authUser.create({
    data: {
      id: TEST_USER_ID,
      email: `verify-${Date.now()}@example.test`,
      role: 'conseiller',
    },
  });
  await prisma.authSession.create({
    data: {
      id: TEST_SESSION_ID,
      sessionToken: TEST_SESSION_TOKEN,
      userId: TEST_USER_ID,
      expires: new Date(Date.now() + 60 * 60 * 1000),
      mfaVerifiedAt: null,
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
  const start = await enroll.start({
    userId: TEST_USER_ID,
    userEmail: 'verify@example.test',
    enrollmentRequestId: uuid(70),
  });
  const totpCode = authenticator.generate(start.secretBase32);
  await enroll.confirm({
    userId: TEST_USER_ID,
    sessionToken: TEST_SESSION_TOKEN,
    enrollmentRequestId: uuid(70),
    totpCode,
    backupCodesAcknowledged: true,
  });
  // Reset mfaVerifiedAt à null pour simuler le state post-login
  // (l'enrôlement l'a posé, mais on veut tester verify séparément).
  await prisma.authSession.update({
    where: { sessionToken: TEST_SESSION_TOKEN },
    data: { mfaVerifiedAt: null },
  });
  return { secretBase32: start.secretBase32, backupCodes: start.backupCodes };
}

function buildVerifyTotp(): VerifyTotpUseCase {
  return new VerifyTotpUseCase(
    new PrismaMfaSecretRepository(),
    new OtplibTotpValidator(),
    new NodeCryptoTotpSecretEncrypter(FAKE_ENV),
    new PostgresMfaRateLimiter(),
    new PrismaMfaAuditWriter(),
    new SesMfaNotificationMailer(),
  );
}

function buildVerifyBackup(): VerifyBackupCodeUseCase {
  return new VerifyBackupCodeUseCase(
    new PrismaMfaSecretRepository(),
    new PrismaBackupCodeRepository(),
    new BcryptBackupCodeHasher(),
    new PostgresMfaRateLimiter(),
    new PrismaMfaAuditWriter(),
    new SesMfaNotificationMailer(),
  );
}

const HEAVY = 60_000;

describe('VerifyTotpUseCase (US3)', () => {
  const useCase = buildVerifyTotp();

  beforeEach(async () => {
    await teardown();
  });
  afterAll(async () => {
    await teardown();
  });

  it('TOTP valide → kind ok + mfaVerifiedAt posé + audit', { timeout: HEAVY }, async () => {
    const { secretBase32 } = await seedEnrolledUser();
    const totpCode = authenticator.generate(secretBase32);

    const result = await useCase.execute({
      userId: TEST_USER_ID,
      userEmail: 'verify@example.test',
      sessionToken: TEST_SESSION_TOKEN,
      totpCode,
    });

    expect(result.kind).toBe('ok');
    const session = await prisma.authSession.findUnique({
      where: { sessionToken: TEST_SESSION_TOKEN },
    });
    expect(session?.mfaVerifiedAt).not.toBeNull();

    const audit = await prisma.mfaAuditEvent.findFirst({
      where: { targetUserId: TEST_USER_ID, eventType: 'mfa_login_verified' },
    });
    expect(audit).not.toBeNull();
  });

  it('TOTP invalide → kind invalid + bucket incrémenté + audit', { timeout: HEAVY }, async () => {
    await seedEnrolledUser();
    const result = await useCase.execute({
      userId: TEST_USER_ID,
      userEmail: 'verify@example.test',
      sessionToken: TEST_SESSION_TOKEN,
      totpCode: '000000',
    });

    expect(result.kind).toBe('invalid');
    if (result.kind === 'invalid') {
      expect(result.attemptsRemaining).toBe(4);
    }

    const audit = await prisma.mfaAuditEvent.findFirst({
      where: { targetUserId: TEST_USER_ID, eventType: 'mfa_login_failed' },
    });
    expect(audit).not.toBeNull();
  });

  it('5 échecs TOTP → kind locked + audit + courriel outbox', { timeout: HEAVY }, async () => {
    await seedEnrolledUser();
    let lastResult:
      | { kind: 'ok'; verifiedAt: Date }
      | { kind: 'invalid'; attemptsRemaining: number }
      | { kind: 'locked'; unlockAt: Date }
      | undefined;
    for (let i = 0; i < 5; i++) {
      lastResult = await useCase.execute({
        userId: TEST_USER_ID,
        userEmail: 'verify@example.test',
        sessionToken: TEST_SESSION_TOKEN,
        totpCode: '000000',
      });
    }

    expect(lastResult?.kind).toBe('locked');
    const locked = await prisma.mfaAuditEvent.findFirst({
      where: { targetUserId: TEST_USER_ID, eventType: 'mfa_login_locked' },
    });
    expect(locked).not.toBeNull();
    const outbox = await prisma.mfaOutboxEmail.findFirst({
      where: { recipientUserId: TEST_USER_ID, templateKind: 'login_locked' },
    });
    expect(outbox).not.toBeNull();
  });
});

describe('VerifyBackupCodeUseCase (US3)', () => {
  const useCase = buildVerifyBackup();

  beforeEach(async () => {
    await teardown();
  });
  afterAll(async () => {
    await teardown();
  });

  it(
    'backup code valide → kind ok + consumeAtomic + audit + remainingCount=9',
    { timeout: HEAVY },
    async () => {
      const { backupCodes } = await seedEnrolledUser();
      const code = backupCodes[0];
      if (!code) throw new Error('No backup codes');

      const result = await useCase.execute({
        userId: TEST_USER_ID,
        userEmail: 'verify@example.test',
        sessionToken: TEST_SESSION_TOKEN,
        backupCode: code,
      });

      expect(result.kind).toBe('ok');
      if (result.kind === 'ok') {
        expect(result.remainingCount).toBe(9);
        expect(result.warnLowCodes).toBe(false);
      }

      const audit = await prisma.mfaAuditEvent.findFirst({
        where: { targetUserId: TEST_USER_ID, eventType: 'mfa_backup_code_consumed' },
      });
      expect(audit).not.toBeNull();
    },
  );

  it(
    'backup code déjà consommé → kind invalid (race ou réutilisation)',
    { timeout: HEAVY },
    async () => {
      const { backupCodes } = await seedEnrolledUser();
      const code = backupCodes[0];
      if (!code) throw new Error('No backup codes');

      // Première consommation
      const first = await useCase.execute({
        userId: TEST_USER_ID,
        userEmail: 'verify@example.test',
        sessionToken: TEST_SESSION_TOKEN,
        backupCode: code,
      });
      expect(first.kind).toBe('ok');

      // Re-tentative avec le même code → invalid
      const second = await useCase.execute({
        userId: TEST_USER_ID,
        userEmail: 'verify@example.test',
        sessionToken: TEST_SESSION_TOKEN,
        backupCode: code,
      });
      expect(second.kind).toBe('invalid');
    },
  );

  it('warnLowCodes émis quand remainingCount tombe à 2', { timeout: HEAVY }, async () => {
    const { backupCodes } = await seedEnrolledUser();
    // Consomme 8 codes → 2 restants
    for (let i = 0; i < 8; i++) {
      const code = backupCodes[i];
      if (!code) throw new Error('No backup codes');
      await useCase.execute({
        userId: TEST_USER_ID,
        userEmail: 'verify@example.test',
        sessionToken: TEST_SESSION_TOKEN,
        backupCode: code,
      });
    }

    const warning = await prisma.mfaAuditEvent.findFirst({
      where: { targetUserId: TEST_USER_ID, eventType: 'mfa_backup_codes_warning_low' },
    });
    expect(warning).not.toBeNull();
  });
});
