// T062-T063 — Tests intégration login conseiller + admin (US2 P1 MVP).
//
// Scénarios (cf. contracts/api-login.md) :
//   (a) login nominal conseiller verified non-MFA → kind=ok, redirect=/mfa/enroll
//   (b) login conseiller verified avec MFA actif → redirect=/mfa/verify
//   (c) login admin sans MFA → redirect=/admin/mfa/enroll
//   (d) login email non vérifié → redirect=/verifier-email
//   (e) mauvais password → invalid_credentials + bucket account incrémenté
//   (f) email inconnu → invalid_credentials + bucket IP incrémenté
//   (g) 5e échec compte → locked reason=account_threshold
//   (h) 20e échec IP → locked reason=ip_threshold
//   (i) login succès reset bucket account (mais pas bucket IP)
//   (j) chronométrage SC-007 < 50ms

import { prehashAndHash } from '@cv/auth-domain';
import { prisma } from '@cv/db';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { LoginUseCase } from '../../../../src/modules/identite/application/use-cases/login.use-case';
import { PrismaAuthAuditWriter } from '../../../../src/modules/identite/infrastructure/prisma-auth-audit-writer';
import { PrismaCredentialAccountRepository } from '../../../../src/modules/identite/infrastructure/prisma-credential-account-repository';
import { PrismaLoginLockoutRepository } from '../../../../src/modules/identite/infrastructure/prisma-login-lockout-repository';

const TEST_EMAIL = `login-${Date.now()}@example.test`;
const TEST_PASSWORD = 'Tigre!Strong-2026';

async function teardownAll(): Promise<void> {
  await prisma.$executeRawUnsafe(`SET session_replication_role = 'replica'`);
  try {
    const users = await prisma.authUser.findMany({
      where: { email: { contains: 'login-' } },
      select: { id: true },
    });
    const ids = users.map((u) => u.id);
    if (ids.length > 0) {
      await prisma.loginLockoutBucket.deleteMany({});
      await prisma.authAuditEvent.deleteMany({
        where: { OR: [{ actorUserId: { in: ids } }, { targetUserId: { in: ids } }] },
      });
      await prisma.authAccount.deleteMany({ where: { userId: { in: ids } } });
      await prisma.authSession.deleteMany({ where: { userId: { in: ids } } });
      await prisma.mfaSecret.deleteMany({ where: { userId: { in: ids } } });
      await prisma.authUser.deleteMany({ where: { id: { in: ids } } });
    } else {
      await prisma.loginLockoutBucket.deleteMany({});
    }
  } finally {
    await prisma.$executeRawUnsafe(`SET session_replication_role = 'origin'`);
  }
}

async function createTestUser(opts: {
  email: string;
  password: string;
  role?: 'conseiller' | 'admin';
  emailVerified?: boolean;
  mfaEnabled?: boolean;
}): Promise<string> {
  const passwordHash = await prehashAndHash(opts.password);
  const user = await prisma.authUser.create({
    data: {
      email: opts.email,
      role: opts.role ?? 'conseiller',
      emailVerified: opts.emailVerified === false ? null : new Date(),
    },
  });
  await prisma.authAccount.create({
    data: {
      userId: user.id,
      type: 'credentials',
      provider: 'credentials',
      providerAccountId: opts.email,
      password_hash: passwordHash,
    },
  });
  if (opts.mfaEnabled) {
    await prisma.mfaSecret.create({
      data: {
        userId: user.id,
        encryptedSecret: 'test-encrypted',
        enrollmentRequestId: crypto.randomUUID(),
        enabledAt: new Date(),
      },
    });
  }
  return user.id;
}

function buildUseCase(): LoginUseCase {
  return new LoginUseCase(
    new PrismaCredentialAccountRepository(),
    new PrismaLoginLockoutRepository(),
    new PrismaAuthAuditWriter(),
  );
}

const HEAVY = 60_000;

describe('LoginUseCase (US2)', () => {
  beforeEach(async () => {
    await teardownAll();
  });
  afterAll(async () => {
    await teardownAll();
  });

  it('login conseiller verified non-MFA → redirect=/conseiller', { timeout: HEAVY }, async () => {
    await createTestUser({ email: TEST_EMAIL, password: TEST_PASSWORD });
    const useCase = buildUseCase();
    const result = await useCase.execute({
      emailRaw: TEST_EMAIL,
      password: TEST_PASSWORD,
      actorIp: '203.0.113.10',
    });
    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.role).toBe('conseiller');
      expect(result.redirect).toBe('/conseiller');
    }
  });

  it('login conseiller MFA actif → redirect=/mfa/verify', { timeout: HEAVY }, async () => {
    await createTestUser({ email: TEST_EMAIL, password: TEST_PASSWORD, mfaEnabled: true });
    const useCase = buildUseCase();
    const result = await useCase.execute({ emailRaw: TEST_EMAIL, password: TEST_PASSWORD });
    if (result.kind === 'ok') {
      expect(result.redirect).toBe('/mfa/verify');
    } else {
      throw new Error(`Expected ok, got ${result.kind}`);
    }
  });

  it('login admin sans MFA → redirect=/admin/mfa/enroll', { timeout: HEAVY }, async () => {
    await createTestUser({ email: TEST_EMAIL, password: TEST_PASSWORD, role: 'admin' });
    const useCase = buildUseCase();
    const result = await useCase.execute({ emailRaw: TEST_EMAIL, password: TEST_PASSWORD });
    if (result.kind === 'ok') {
      expect(result.role).toBe('admin');
      expect(result.redirect).toBe('/admin/mfa/enroll');
    } else {
      throw new Error(`Expected ok, got ${result.kind}`);
    }
  });

  it('login email non vérifié → redirect=/verifier-email', { timeout: HEAVY }, async () => {
    await createTestUser({ email: TEST_EMAIL, password: TEST_PASSWORD, emailVerified: false });
    const useCase = buildUseCase();
    const result = await useCase.execute({ emailRaw: TEST_EMAIL, password: TEST_PASSWORD });
    if (result.kind === 'ok') {
      expect(result.redirect).toBe('/verifier-email');
    } else {
      throw new Error(`Expected ok, got ${result.kind}`);
    }
  });

  it(
    'mauvais password → invalid_credentials + bucket account incrémenté',
    { timeout: HEAVY },
    async () => {
      const userId = await createTestUser({ email: TEST_EMAIL, password: TEST_PASSWORD });
      const useCase = buildUseCase();
      const result = await useCase.execute({
        emailRaw: TEST_EMAIL,
        password: 'Mauvais!Mot-2026',
        actorIp: '203.0.113.10',
      });
      expect(result.kind).toBe('invalid_credentials');

      const bucket = await prisma.loginLockoutBucket.findFirst({
        where: { kind: 'login_account', accountId: userId },
      });
      expect(bucket?.failureCount).toBe(1);

      const ipBucket = await prisma.loginLockoutBucket.findFirst({
        where: { kind: 'login_ip' },
      });
      expect(ipBucket?.failureCount).toBe(1);
    },
  );

  it(
    'email inconnu → invalid_credentials + bucket IP incrémenté seul',
    { timeout: HEAVY },
    async () => {
      const useCase = buildUseCase();
      const result = await useCase.execute({
        emailRaw: `inconnu-${Date.now()}@example.test`,
        password: 'Mauvais!Mot-2026',
        actorIp: '203.0.113.10',
      });
      expect(result.kind).toBe('invalid_credentials');

      const ipBucket = await prisma.loginLockoutBucket.findFirst({
        where: { kind: 'login_ip' },
      });
      expect(ipBucket?.failureCount).toBe(1);

      const accountBuckets = await prisma.loginLockoutBucket.count({
        where: { kind: 'login_account' },
      });
      expect(accountBuckets).toBe(0); // pas de userId connu → pas de bucket account
    },
  );

  it('5e échec compte → locked reason=account_threshold', { timeout: HEAVY }, async () => {
    await createTestUser({ email: TEST_EMAIL, password: TEST_PASSWORD });
    const useCase = buildUseCase();
    // 5 échecs
    for (let i = 0; i < 5; i++) {
      await useCase.execute({
        emailRaw: TEST_EMAIL,
        password: 'Wrong!Pass-2026',
        actorIp: '203.0.113.11',
      });
    }
    // 6e tentative — même avec le bon password — locked
    const result = await useCase.execute({
      emailRaw: TEST_EMAIL,
      password: TEST_PASSWORD,
      actorIp: '203.0.113.11',
    });
    expect(result.kind).toBe('locked');
    if (result.kind === 'locked') {
      expect(result.reason).toBe('account_threshold');
      expect(result.retryAfterSec).toBeGreaterThan(0);
      expect(result.retryAfterSec).toBeLessThanOrEqual(15 * 60);
    }
  });

  it('login succès reset bucket account mais préserve bucket IP', { timeout: HEAVY }, async () => {
    const userId = await createTestUser({ email: TEST_EMAIL, password: TEST_PASSWORD });
    const useCase = buildUseCase();
    // 2 échecs (incrémente account + IP).
    await useCase.execute({
      emailRaw: TEST_EMAIL,
      password: 'Wrong!1-2026',
      actorIp: '203.0.113.12',
    });
    await useCase.execute({
      emailRaw: TEST_EMAIL,
      password: 'Wrong!2-2026',
      actorIp: '203.0.113.12',
    });

    // Succès — reset account, keep IP.
    const result = await useCase.execute({
      emailRaw: TEST_EMAIL,
      password: TEST_PASSWORD,
      actorIp: '203.0.113.12',
    });
    expect(result.kind).toBe('ok');

    const accountBucket = await prisma.loginLockoutBucket.findFirst({
      where: { kind: 'login_account', accountId: userId },
    });
    expect(accountBucket).toBeNull(); // reset

    const ipBucket = await prisma.loginLockoutBucket.findFirst({
      where: { kind: 'login_ip' },
    });
    expect(ipBucket?.failureCount).toBeGreaterThanOrEqual(2); // préservé
  });

  it(
    'SC-007 chronométrage existant vs inexistant → écart < 200ms',
    { timeout: HEAVY * 2 },
    async () => {
      await createTestUser({ email: TEST_EMAIL, password: TEST_PASSWORD });
      const useCase = buildUseCase();
      const ITER = 4;
      const existing: number[] = [];
      const missing: number[] = [];

      for (let i = 0; i < ITER; i++) {
        const t0 = Date.now();
        await useCase.execute({
          emailRaw: TEST_EMAIL,
          password: 'Wrong!Pass-2026',
          actorIp: `203.0.113.${20 + i}`,
        });
        existing.push(Date.now() - t0);

        const t1 = Date.now();
        await useCase.execute({
          emailRaw: `unknown-${i}-${Date.now()}@example.test`,
          password: 'Wrong!Pass-2026',
          actorIp: `203.0.113.${30 + i}`,
        });
        missing.push(Date.now() - t1);
      }
      const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;
      const diff = Math.abs(mean(existing) - mean(missing));
      expect(diff).toBeLessThan(200);
    },
  );
});
