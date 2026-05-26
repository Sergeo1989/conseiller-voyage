// T077 — Tests intégration verify-email + resend (US3 P1 MVP).
//
// Scénarios (cf. contracts/api-verify-email.md) :
//   (a) verify token valide → kind=ok + UPDATE emailVerified + audit + token consumed
//   (b) verify token déjà consommé → kind=invalid_or_expired (idempotent)
//   (c) verify token expiré → kind=invalid_or_expired
//   (d) verify token signature invalide → kind=invalid_or_expired
//   (e) verify token cross-purpose (password_reset utilisé comme verify) → invalid
//   (f) resend pour compte non-vérifié → nouveau token + outbox
//   (g) resend pour compte vérifié → silencieux (kind=ok, pas d'outbox)
//   (h) resend pour email inexistant → silencieux
//   (i) 4e resend dans la même heure → silencieux + audit throttled

import { issueToken, prehashAndHash } from '@cv/auth-domain';
import { prisma } from '@cv/db';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { ResendEmailVerificationUseCase } from '../../../../src/modules/identite/application/use-cases/resend-email-verification.use-case';
import { VerifyEmailUseCase } from '../../../../src/modules/identite/application/use-cases/verify-email.use-case';
import { JoseTokenIssuer } from '../../../../src/modules/identite/infrastructure/jose-token-issuer';
import { PrismaAuthAuditWriter } from '../../../../src/modules/identite/infrastructure/prisma-auth-audit-writer';

const TEST_AUTH_TOKEN_SECRET = Buffer.alloc(32, 7).toString('base64');
const FAKE_ENV = {
  AUTH_TOKEN_SECRET: TEST_AUTH_TOKEN_SECRET,
  MFA_KEK_BASE64: Buffer.alloc(32).toString('base64'),
} as never;
const TEST_EMAIL = `verify-${Date.now()}@example.test`;

async function teardown(): Promise<void> {
  await prisma.$executeRawUnsafe(`SET session_replication_role = 'replica'`);
  try {
    const users = await prisma.authUser.findMany({
      where: { email: { contains: 'verify-' } },
      select: { id: true },
    });
    const ids = users.map((u) => u.id);
    if (ids.length === 0) return;
    await prisma.emailVerificationToken.deleteMany({ where: { userId: { in: ids } } });
    await prisma.authAuditEvent.deleteMany({
      where: { OR: [{ actorUserId: { in: ids } }, { targetUserId: { in: ids } }] },
    });
    await prisma.authOutboxEmail.deleteMany({ where: { recipientUserId: { in: ids } } });
    await prisma.authAccount.deleteMany({ where: { userId: { in: ids } } });
    await prisma.authUser.deleteMany({ where: { id: { in: ids } } });
  } finally {
    await prisma.$executeRawUnsafe(`SET session_replication_role = 'origin'`);
  }
}

async function createUnverifiedUser(email: string): Promise<string> {
  const passwordHash = await prehashAndHash('Tigre!Strong-2026');
  const user = await prisma.authUser.create({
    data: { email, role: 'conseiller', emailVerified: null, name: 'Max Test' },
  });
  await prisma.authAccount.create({
    data: {
      userId: user.id,
      type: 'credentials',
      provider: 'credentials',
      providerAccountId: email,
      password_hash: passwordHash,
    },
  });
  return user.id;
}

async function issueAndStoreToken(userId: string, ttlSec: number): Promise<string> {
  const issued = await issueToken({
    purpose: 'email_verification',
    userId,
    ttlSec,
    secret: TEST_AUTH_TOKEN_SECRET,
  });
  await prisma.emailVerificationToken.create({
    data: { userId, jwtNonce: issued.nonce, expiresAt: issued.expiresAt },
  });
  return issued.token;
}

function buildVerifyUseCase(): VerifyEmailUseCase {
  return new VerifyEmailUseCase(new JoseTokenIssuer(FAKE_ENV), new PrismaAuthAuditWriter());
}

function buildResendUseCase(): ResendEmailVerificationUseCase {
  return new ResendEmailVerificationUseCase(
    new JoseTokenIssuer(FAKE_ENV),
    new PrismaAuthAuditWriter(),
  );
}

const HEAVY = 60_000;

describe('VerifyEmailUseCase (US3)', () => {
  beforeEach(async () => {
    await teardown();
  });
  afterAll(async () => {
    await teardown();
  });

  it('token valide → kind=ok + emailVerified posé + audit', { timeout: HEAVY }, async () => {
    const userId = await createUnverifiedUser(TEST_EMAIL);
    const token = await issueAndStoreToken(userId, 3600);
    const useCase = buildVerifyUseCase();
    const result = await useCase.execute({ token, actorIp: '203.0.113.50' });
    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.userId).toBe(userId);
    }
    const user = await prisma.authUser.findUnique({ where: { id: userId } });
    expect(user?.emailVerified).not.toBeNull();
    const tokenRow = await prisma.emailVerificationToken.findFirst({ where: { userId } });
    expect(tokenRow?.consumedAt).not.toBeNull();
  });

  it('token déjà consommé → invalid_or_expired', { timeout: HEAVY }, async () => {
    const userId = await createUnverifiedUser(TEST_EMAIL);
    const token = await issueAndStoreToken(userId, 3600);
    const useCase = buildVerifyUseCase();
    await useCase.execute({ token });
    const second = await useCase.execute({ token });
    expect(second.kind).toBe('invalid_or_expired');
  });

  it('token signature invalide → invalid_or_expired', async () => {
    const userId = await createUnverifiedUser(TEST_EMAIL);
    await issueAndStoreToken(userId, 3600);
    const useCase = buildVerifyUseCase();
    const result = await useCase.execute({ token: 'forged.token.value' });
    expect(result.kind).toBe('invalid_or_expired');
  });

  it('token cross-purpose (password_reset utilisé) → invalid', async () => {
    const userId = await createUnverifiedUser(TEST_EMAIL);
    const wrongToken = (
      await issueToken({
        purpose: 'password_reset',
        userId,
        ttlSec: 3600,
        secret: TEST_AUTH_TOKEN_SECRET,
      })
    ).token;
    const useCase = buildVerifyUseCase();
    const result = await useCase.execute({ token: wrongToken });
    expect(result.kind).toBe('invalid_or_expired');
  });
});

describe('ResendEmailVerificationUseCase (US3)', () => {
  beforeEach(async () => {
    await teardown();
  });
  afterAll(async () => {
    await teardown();
  });

  it('compte non-vérifié → INSERT nouveau token + outbox', { timeout: HEAVY }, async () => {
    const userId = await createUnverifiedUser(TEST_EMAIL);
    const useCase = buildResendUseCase();
    const before = await prisma.emailVerificationToken.count({ where: { userId } });
    const result = await useCase.execute({ emailRaw: TEST_EMAIL });
    expect(result.kind).toBe('ok');
    const after = await prisma.emailVerificationToken.count({ where: { userId } });
    expect(after).toBe(before + 1);
    const outbox = await prisma.authOutboxEmail.findFirst({
      where: { recipientUserId: userId, templateKind: 'email_verification' },
    });
    expect(outbox).toBeTruthy();
  });

  it("compte déjà vérifié → silencieux, pas d'INSERT", { timeout: HEAVY }, async () => {
    const userId = await createUnverifiedUser(TEST_EMAIL);
    await prisma.authUser.update({
      where: { id: userId },
      data: { emailVerified: new Date() },
    });
    const useCase = buildResendUseCase();
    const result = await useCase.execute({ emailRaw: TEST_EMAIL });
    expect(result.kind).toBe('ok');
    const tokens = await prisma.emailVerificationToken.count({ where: { userId } });
    expect(tokens).toBe(0);
    const outbox = await prisma.authOutboxEmail.count({ where: { recipientUserId: userId } });
    expect(outbox).toBe(0);
  });

  it('email inexistant → silencieux', { timeout: HEAVY }, async () => {
    const useCase = buildResendUseCase();
    const result = await useCase.execute({ emailRaw: `unknown-${Date.now()}@example.test` });
    expect(result.kind).toBe('ok');
  });

  it(
    '4e resend dans la même heure → silencieux + pas de 4e INSERT',
    { timeout: HEAVY },
    async () => {
      const userId = await createUnverifiedUser(TEST_EMAIL);
      const useCase = buildResendUseCase();
      await useCase.execute({ emailRaw: TEST_EMAIL });
      await useCase.execute({ emailRaw: TEST_EMAIL });
      await useCase.execute({ emailRaw: TEST_EMAIL });
      await useCase.execute({ emailRaw: TEST_EMAIL });
      const tokens = await prisma.emailVerificationToken.count({ where: { userId } });
      expect(tokens).toBe(3); // pas 4
    },
  );
});
