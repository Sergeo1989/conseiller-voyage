// T100 — Tests intégration reset MFA admin (US4).
//
// Scénarios :
//   (a) reset conseiller par admin → secret DELETE + sessions
//       invalidées + audit + courriel outbox
//   (b) reset admin par admin → idem (FR-022 cible admin)
//   (c) auto-reset (actor.id === target.id) → 400 SELF_RESET_FORBIDDEN
//   (d) target inexistant → 404 TARGET_NOT_FOUND
//   (e) target non enrôlé → 409 TARGET_NOT_ENROLLED
//   (f) warningDisplayedLastAdmin true quand on reset le dernier
//       autre admin (compteur=2 avant action, FR-026b)

import { prisma } from '@cv/db';
import { authenticator } from 'otplib';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { EnrollTotpUseCase } from '../../../../src/modules/identite/application/use-cases/enroll-totp.use-case';
import { ResetMfaAdminUseCase } from '../../../../src/modules/identite/application/use-cases/reset-mfa-admin.use-case';
import { BcryptBackupCodeHasher } from '../../../../src/modules/identite/infrastructure/bcrypt-backup-code-hasher';
import { NodeCryptoTotpSecretEncrypter } from '../../../../src/modules/identite/infrastructure/node-crypto-totp-secret-encrypter';
import { OtplibTotpValidator } from '../../../../src/modules/identite/infrastructure/otplib-totp-validator';
import { PrismaActiveSessionRevoker } from '../../../../src/modules/identite/infrastructure/prisma-active-session-revoker';
import { PrismaBackupCodeRepository } from '../../../../src/modules/identite/infrastructure/prisma-backup-code-repository';
import { PrismaMfaAuditWriter } from '../../../../src/modules/identite/infrastructure/prisma-mfa-audit-writer';
import { PrismaMfaSecretRepository } from '../../../../src/modules/identite/infrastructure/prisma-mfa-secret-repository';
import { SesMfaNotificationMailer } from '../../../../src/modules/identite/infrastructure/ses-mfa-notification-mailer';

authenticator.options = { step: 30, window: 1, digits: 6 };

const TEST_KEK_BASE64 = Buffer.alloc(32).toString('base64');
const FAKE_ENV = { MFA_KEK_BASE64: TEST_KEK_BASE64 } as never;

const ADMIN_ACTOR_ID = '00000000-0000-4000-8000-aaaa01000001';
const ADMIN_TARGET_ID = '00000000-0000-4000-8000-aaaa01000002';
const CONSEILLER_TARGET_ID = '00000000-0000-4000-8000-aaaa01000003';

const ALL_USER_IDS = [ADMIN_ACTOR_ID, ADMIN_TARGET_ID, CONSEILLER_TARGET_ID];

function uuid(seed: number): string {
  return `00000000-0000-4000-8000-${seed.toString(16).padStart(12, '0')}`;
}

async function teardown(): Promise<void> {
  await prisma.$executeRawUnsafe(`SET session_replication_role = 'replica'`);
  try {
    await prisma.mfaAuditEvent.deleteMany({
      where: {
        OR: [{ actorUserId: { in: ALL_USER_IDS } }, { targetUserId: { in: ALL_USER_IDS } }],
      },
    });
    await prisma.mfaOutboxEmail.deleteMany({
      where: { recipientUserId: { in: ALL_USER_IDS } },
    });
    await prisma.mfaRateLimitBucket.deleteMany({
      where: { userId: { in: ALL_USER_IDS } },
    });
    await prisma.mfaBackupCode.deleteMany({});
    await prisma.mfaSecret.deleteMany({ where: { userId: { in: ALL_USER_IDS } } });
    await prisma.authSession.deleteMany({ where: { userId: { in: ALL_USER_IDS } } });
    await prisma.authUser.deleteMany({ where: { id: { in: ALL_USER_IDS } } });
  } finally {
    await prisma.$executeRawUnsafe(`SET session_replication_role = 'origin'`);
  }
}

// Offset spécifique à ce fichier pour éviter les collisions
// d'enrollmentRequestId avec enroll-flow et verify-flow tests.
const RESET_ADMIN_SEED_BASE = 70_000;

async function seedEnrolledUser(
  userId: string,
  role: 'admin' | 'conseiller',
  emailPrefix: string,
  seedSuffix: number,
): Promise<void> {
  await prisma.authUser.create({
    data: {
      id: userId,
      email: `${emailPrefix}-${Date.now()}-${Math.random()}@example.test`,
      name: role === 'admin' ? 'Admin Test' : 'Conseiller Test',
      role,
    },
  });
  const sessionToken = `session-${userId}`;
  await prisma.authSession.create({
    data: {
      id: uuid(RESET_ADMIN_SEED_BASE + seedSuffix + 1),
      sessionToken,
      userId,
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
  const reqId = uuid(RESET_ADMIN_SEED_BASE + seedSuffix + 100);
  const start = await enroll.start({
    userId,
    userEmail: 'test@example.test',
    enrollmentRequestId: reqId,
  });
  await enroll.confirm({
    userId,
    sessionToken,
    enrollmentRequestId: reqId,
    totpCode: authenticator.generate(start.secretBase32),
    backupCodesAcknowledged: true,
  });
}

function buildUseCase(): ResetMfaAdminUseCase {
  return new ResetMfaAdminUseCase(
    new PrismaMfaSecretRepository(),
    new PrismaActiveSessionRevoker(),
    new PrismaMfaAuditWriter(),
    new SesMfaNotificationMailer(),
  );
}

const HEAVY = 60_000;

describe('ResetMfaAdminUseCase (US4)', () => {
  const useCase = buildUseCase();

  beforeEach(async () => {
    await teardown();
  });
  afterAll(async () => {
    await teardown();
  });

  it(
    'reset conseiller par admin → secret DELETE + sessions invalidées + audit + courriel',
    { timeout: HEAVY },
    async () => {
      await seedEnrolledUser(ADMIN_ACTOR_ID, 'admin', 'admin', 1);
      await seedEnrolledUser(CONSEILLER_TARGET_ID, 'conseiller', 'conseiller', 2);

      const result = await useCase.execute({
        actor: { id: ADMIN_ACTOR_ID, role: 'admin', name: 'Admin Test' },
        targetUserId: CONSEILLER_TARGET_ID,
        justification: 'Reset demandé suite à perte de device — vérification téléphone OK',
        idempotencyKey: uuid(999),
      });

      expect(result.targetRole).toBe('conseiller');
      expect(result.sessionsRevokedCount).toBe(1);
      expect(result.warningDisplayedLastAdmin).toBe(false);

      // Secret supprimé
      const secret = await prisma.mfaSecret.findFirst({
        where: { userId: CONSEILLER_TARGET_ID },
      });
      expect(secret).toBeNull();

      // Sessions cibles révoquées
      const sessions = await prisma.authSession.findMany({
        where: { userId: CONSEILLER_TARGET_ID },
      });
      expect(sessions).toHaveLength(0);

      // Audit présent
      const audit = await prisma.mfaAuditEvent.findFirst({
        where: { targetUserId: CONSEILLER_TARGET_ID, eventType: 'mfa_reset_by_admin' },
      });
      expect(audit).not.toBeNull();
      expect(audit?.justification?.length).toBeGreaterThanOrEqual(20);
      expect(audit?.targetRole).toBe('conseiller');

      // Courriel outbox
      const outbox = await prisma.mfaOutboxEmail.findFirst({
        where: { recipientUserId: CONSEILLER_TARGET_ID, templateKind: 'admin_reset' },
      });
      expect(outbox).not.toBeNull();
    },
  );

  it('reset admin par autre admin → idem (FR-022 cible admin)', { timeout: HEAVY }, async () => {
    await seedEnrolledUser(ADMIN_ACTOR_ID, 'admin', 'actor', 3);
    await seedEnrolledUser(ADMIN_TARGET_ID, 'admin', 'target', 4);

    const result = await useCase.execute({
      actor: { id: ADMIN_ACTOR_ID, role: 'admin', name: 'Admin Test' },
      targetUserId: ADMIN_TARGET_ID,
      justification: 'Admin cible a perdu son device + backup codes — appel pro + ID confirmé',
      idempotencyKey: uuid(998),
    });

    expect(result.targetRole).toBe('admin');
    // 2 admins actifs avant action → warningDisplayedLastAdmin true
    expect(result.warningDisplayedLastAdmin).toBe(true);

    const audit = await prisma.mfaAuditEvent.findFirst({
      where: { targetUserId: ADMIN_TARGET_ID, eventType: 'mfa_reset_by_admin' },
    });
    expect(audit?.targetRole).toBe('admin');
  });

  it(
    'auto-reset (actor.id === target.id) → 400 SELF_RESET_FORBIDDEN',
    { timeout: HEAVY },
    async () => {
      await seedEnrolledUser(ADMIN_ACTOR_ID, 'admin', 'admin', 5);

      await expect(
        useCase.execute({
          actor: { id: ADMIN_ACTOR_ID, role: 'admin', name: 'Admin Test' },
          targetUserId: ADMIN_ACTOR_ID,
          justification: 'Tentative auto-reset interdite par FR-022a',
          idempotencyKey: uuid(997),
        }),
      ).rejects.toMatchObject({
        response: { code: 'SELF_RESET_FORBIDDEN' },
      });
    },
  );

  it('target inexistant → 404 TARGET_NOT_FOUND', { timeout: HEAVY }, async () => {
    await seedEnrolledUser(ADMIN_ACTOR_ID, 'admin', 'admin', 6);

    await expect(
      useCase.execute({
        actor: { id: ADMIN_ACTOR_ID, role: 'admin', name: 'Admin Test' },
        targetUserId: '00000000-0000-4000-8000-000000999999',
        justification: 'Test target inexistant — message > 20 caractères de validation',
        idempotencyKey: uuid(996),
      }),
    ).rejects.toMatchObject({
      response: { code: 'TARGET_NOT_FOUND' },
    });
  });

  it('target non enrôlé → 409 TARGET_NOT_ENROLLED', { timeout: HEAVY }, async () => {
    await seedEnrolledUser(ADMIN_ACTOR_ID, 'admin', 'admin', 7);
    // Conseiller sans MFA actif
    await prisma.authUser.create({
      data: {
        id: CONSEILLER_TARGET_ID,
        email: `noenroll-${Date.now()}@example.test`,
        name: 'Sans MFA',
        role: 'conseiller',
      },
    });

    await expect(
      useCase.execute({
        actor: { id: ADMIN_ACTOR_ID, role: 'admin', name: 'Admin Test' },
        targetUserId: CONSEILLER_TARGET_ID,
        justification: 'Test reset sur user sans MFA actif — > 20 caractères',
        idempotencyKey: uuid(995),
      }),
    ).rejects.toMatchObject({
      response: { code: 'TARGET_NOT_ENROLLED' },
    });
  });
});
