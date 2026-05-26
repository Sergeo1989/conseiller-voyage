// T077 — Test intégration du flow step-up US2.
//
// Scénarios :
//   (a) session non fresh + code TOTP valide → mfaVerifiedAt posé, audit
//       `mfa_stepup_verified`
//   (b) code TOTP invalide → kind 'invalid' + bucket incrémenté + audit
//       `mfa_stepup_failed`
//   (c) 3 échecs consécutifs → kind 'session_killed' + DELETE session +
//       courriel en outbox + audit `mfa_stepup_session_killed`
//   (d) buckets stepup_totp scope-session indépendants (P0-3) : 2
//       sessions du même user, 2 échecs dans la session A n'affectent
//       pas la session B

import { prisma } from '@cv/db';
import { authenticator } from 'otplib';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { EnrollTotpUseCase } from '../../../../src/modules/identite/application/use-cases/enroll-totp.use-case';
import { StepUpUseCase } from '../../../../src/modules/identite/application/use-cases/step-up.use-case';
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

const TEST_USER_ID = '00000000-0000-4000-8000-fffa00000001';
const SESSION_A_ID = '00000000-0000-4000-8000-fffa00000002';
const SESSION_B_ID = '00000000-0000-4000-8000-fffa00000003';
const SESSION_A_TOKEN = 'test-session-token-stepup-a';
const SESSION_B_TOKEN = 'test-session-token-stepup-b';

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

async function setupEnrolledUserWithSession(
  sessionToken: string,
  sessionId: string,
): Promise<string> {
  // Crée le user + session si non existants. Si l'user existe déjà
  // (cas de la 2ème session), n'ajoute que la session.
  const userExists = await prisma.authUser.findUnique({ where: { id: TEST_USER_ID } });
  if (!userExists) {
    await prisma.authUser.create({
      data: {
        id: TEST_USER_ID,
        email: `stepup-${Date.now()}@example.test`,
        role: 'conseiller',
      },
    });
  }
  await prisma.authSession.create({
    data: {
      id: sessionId,
      sessionToken,
      userId: TEST_USER_ID,
      expires: new Date(Date.now() + 60 * 60 * 1000),
      // Volontairement non-frais — pour que step-up soit requis.
      mfaVerifiedAt: new Date(Date.now() - 60 * 60 * 1000),
    },
  });

  // Enrôle le user si pas déjà fait.
  const existing = await prisma.mfaSecret.findFirst({
    where: { userId: TEST_USER_ID, enabledAt: { not: null } },
  });
  if (existing) return existing.id;

  const enrollUseCase = new EnrollTotpUseCase(
    new PrismaMfaSecretRepository(),
    new PrismaBackupCodeRepository(),
    new OtplibTotpValidator(),
    new NodeCryptoTotpSecretEncrypter(FAKE_ENV),
    new BcryptBackupCodeHasher(),
    new PrismaMfaAuditWriter(),
  );
  const start = await enrollUseCase.start({
    userId: TEST_USER_ID,
    userEmail: 'stepup@example.test',
    enrollmentRequestId: uuid(99),
  });
  const totpCode = authenticator.generate(start.secretBase32);
  await enrollUseCase.confirm({
    userId: TEST_USER_ID,
    sessionToken,
    enrollmentRequestId: uuid(99),
    totpCode,
    backupCodesAcknowledged: true,
  });

  // Récupère le secret pour les tests TOTP générés.
  const secret = await prisma.mfaSecret.findFirst({
    where: { userId: TEST_USER_ID, enabledAt: { not: null } },
  });
  if (!secret) throw new Error('Setup failed: no enrolled secret');
  return start.secretBase32; // retourne le clair pour générer codes test
}

function buildStepUpUseCase(): StepUpUseCase {
  return new StepUpUseCase(
    new PrismaMfaSecretRepository(),
    new OtplibTotpValidator(),
    new NodeCryptoTotpSecretEncrypter(FAKE_ENV),
    new PostgresMfaRateLimiter(),
    new PrismaMfaAuditWriter(),
    new SesMfaNotificationMailer(),
  );
}

const HEAVY = 30_000;

describe('StepUpUseCase flow (US2)', () => {
  const useCase = buildStepUpUseCase();

  beforeEach(async () => {
    await teardown();
  });
  afterAll(async () => {
    await teardown();
  });

  it(
    'session non fresh + TOTP valide → kind ok + mfaVerifiedAt posé + audit',
    { timeout: HEAVY },
    async () => {
      const secret = await setupEnrolledUserWithSession(SESSION_A_TOKEN, SESSION_A_ID);
      const totpCode = authenticator.generate(secret);

      const result = await useCase.execute({
        userId: TEST_USER_ID,
        userEmail: 'stepup@example.test',
        sessionId: SESSION_A_ID,
        sessionToken: SESSION_A_TOKEN,
        totpCode,
        intendedAction: 'accept_lead',
      });

      expect(result.kind).toBe('ok');
      if (result.kind === 'ok') {
        expect(result.verifiedAt).toBeInstanceOf(Date);
      }

      const session = await prisma.authSession.findUnique({
        where: { sessionToken: SESSION_A_TOKEN },
      });
      expect(session?.mfaVerifiedAt?.getTime()).toBeGreaterThan(Date.now() - 5000);

      const verified = await prisma.mfaAuditEvent.findFirst({
        where: { targetUserId: TEST_USER_ID, eventType: 'mfa_stepup_verified' },
      });
      expect(verified).not.toBeNull();
    },
  );

  it(
    'code TOTP invalide → kind invalid + attempts incrémenté + audit failed',
    { timeout: HEAVY },
    async () => {
      await setupEnrolledUserWithSession(SESSION_A_TOKEN, SESSION_A_ID);

      const result = await useCase.execute({
        userId: TEST_USER_ID,
        userEmail: 'stepup@example.test',
        sessionId: SESSION_A_ID,
        sessionToken: SESSION_A_TOKEN,
        totpCode: '000000',
        intendedAction: 'accept_lead',
      });

      expect(result.kind).toBe('invalid');
      if (result.kind === 'invalid') {
        expect(result.attemptsRemaining).toBe(2);
      }

      const failed = await prisma.mfaAuditEvent.findFirst({
        where: { targetUserId: TEST_USER_ID, eventType: 'mfa_stepup_failed' },
      });
      expect(failed).not.toBeNull();
    },
  );

  it(
    '3 échecs consécutifs → kind session_killed + session DELETED + courriel outbox + audit',
    { timeout: HEAVY },
    async () => {
      await setupEnrolledUserWithSession(SESSION_A_TOKEN, SESSION_A_ID);

      // 1er et 2e échec → invalid
      await useCase.execute({
        userId: TEST_USER_ID,
        userEmail: 'stepup@example.test',
        sessionId: SESSION_A_ID,
        sessionToken: SESSION_A_TOKEN,
        totpCode: '000000',
        intendedAction: 'accept_lead',
      });
      await useCase.execute({
        userId: TEST_USER_ID,
        userEmail: 'stepup@example.test',
        sessionId: SESSION_A_ID,
        sessionToken: SESSION_A_TOKEN,
        totpCode: '000000',
        intendedAction: 'accept_lead',
      });

      // 3e échec → session_killed
      const result = await useCase.execute({
        userId: TEST_USER_ID,
        userEmail: 'stepup@example.test',
        sessionId: SESSION_A_ID,
        sessionToken: SESSION_A_TOKEN,
        totpCode: '000000',
        intendedAction: 'accept_lead',
      });

      expect(result.kind).toBe('session_killed');

      const session = await prisma.authSession.findUnique({
        where: { sessionToken: SESSION_A_TOKEN },
      });
      expect(session).toBeNull();

      const killed = await prisma.mfaAuditEvent.findFirst({
        where: { targetUserId: TEST_USER_ID, eventType: 'mfa_stepup_session_killed' },
      });
      expect(killed).not.toBeNull();

      const outbox = await prisma.mfaOutboxEmail.findFirst({
        where: { recipientUserId: TEST_USER_ID, templateKind: 'stepup_session_killed' },
      });
      expect(outbox).not.toBeNull();
    },
  );

  it(
    'P0-3 : 2 sessions du même user — échecs dans A n affectent pas B',
    { timeout: HEAVY },
    async () => {
      const secret = await setupEnrolledUserWithSession(SESSION_A_TOKEN, SESSION_A_ID);
      await setupEnrolledUserWithSession(SESSION_B_TOKEN, SESSION_B_ID);

      // 2 échecs dans la session A → invalid (pas encore tué)
      await useCase.execute({
        userId: TEST_USER_ID,
        userEmail: 'stepup@example.test',
        sessionId: SESSION_A_ID,
        sessionToken: SESSION_A_TOKEN,
        totpCode: '000000',
        intendedAction: 'accept_lead',
      });
      await useCase.execute({
        userId: TEST_USER_ID,
        userEmail: 'stepup@example.test',
        sessionId: SESSION_A_ID,
        sessionToken: SESSION_A_TOKEN,
        totpCode: '000000',
        intendedAction: 'accept_lead',
      });

      // La session B doit toujours être active.
      const sessionB = await prisma.authSession.findUnique({
        where: { sessionToken: SESSION_B_TOKEN },
      });
      expect(sessionB).not.toBeNull();

      // Step-up dans B avec code valide → OK, pas affecté par les échecs A.
      const totpCode = authenticator.generate(secret);
      const result = await useCase.execute({
        userId: TEST_USER_ID,
        userEmail: 'stepup@example.test',
        sessionId: SESSION_B_ID,
        sessionToken: SESSION_B_TOKEN,
        totpCode,
        intendedAction: 'accept_lead',
      });
      expect(result.kind).toBe('ok');
    },
  );
});
