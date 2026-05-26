// T086 — Tests intégration logout (US4 P1 MVP).
//
// Scénarios (cf. contracts/api-logout.md) :
//   (a) logout d'une session valide → kind=ok + DELETE session + audit
//   (b) logout session inexistante → kind=no_session
//   (c) autres sessions du même user restent actives (FR-027)

import { randomBytes } from 'node:crypto';
import { prisma } from '@cv/db';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { LogoutUseCase } from '../../../../src/modules/identite/application/use-cases/logout.use-case';
import { PrismaAuthAuditWriter } from '../../../../src/modules/identite/infrastructure/prisma-auth-audit-writer';

const TEST_EMAIL = `logout-${Date.now()}@example.test`;

async function teardown(): Promise<void> {
  await prisma.$executeRawUnsafe(`SET session_replication_role = 'replica'`);
  try {
    const users = await prisma.authUser.findMany({
      where: { email: { contains: 'logout-' } },
      select: { id: true },
    });
    const ids = users.map((u) => u.id);
    if (ids.length === 0) return;
    await prisma.authAuditEvent.deleteMany({
      where: { OR: [{ actorUserId: { in: ids } }, { targetUserId: { in: ids } }] },
    });
    await prisma.authAccount.deleteMany({ where: { userId: { in: ids } } });
    await prisma.authSession.deleteMany({ where: { userId: { in: ids } } });
    await prisma.authUser.deleteMany({ where: { id: { in: ids } } });
  } finally {
    await prisma.$executeRawUnsafe(`SET session_replication_role = 'origin'`);
  }
}

async function createUserWithSessions(): Promise<{
  userId: string;
  sessionTokens: readonly string[];
}> {
  const user = await prisma.authUser.create({
    data: { email: TEST_EMAIL, role: 'conseiller', emailVerified: new Date() },
  });
  const tokens: string[] = [];
  for (let i = 0; i < 3; i++) {
    const sessionToken = randomBytes(32).toString('hex');
    await prisma.authSession.create({
      data: {
        sessionToken,
        userId: user.id,
        expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });
    tokens.push(sessionToken);
  }
  return { userId: user.id, sessionTokens: tokens };
}

function buildUseCase(): LogoutUseCase {
  return new LogoutUseCase(new PrismaAuthAuditWriter());
}

describe('LogoutUseCase (US4)', () => {
  beforeEach(async () => {
    await teardown();
  });
  afterAll(async () => {
    await teardown();
  });

  it('logout session valide → kind=ok + DELETE session + audit', async () => {
    const { userId, sessionTokens } = await createUserWithSessions();
    const first = sessionTokens[0];
    if (!first) throw new Error('expected session token');
    const useCase = buildUseCase();
    const result = await useCase.execute({
      sessionToken: first,
      userId,
      actorIp: '203.0.113.99',
    });
    expect(result.kind).toBe('ok');
    const session = await prisma.authSession.findUnique({ where: { sessionToken: first } });
    expect(session).toBeNull();
    const audit = await prisma.authAuditEvent.findFirst({
      where: { targetUserId: userId, eventType: 'logout' },
    });
    expect(audit).toBeTruthy();
    const meta = audit?.metadata as { sessionTokenHash?: string };
    expect(meta?.sessionTokenHash).toBeTruthy();
    expect(meta?.sessionTokenHash).not.toBe(first); // hashé, pas en clair
  });

  it('logout session inexistante → kind=no_session', async () => {
    const { userId } = await createUserWithSessions();
    const useCase = buildUseCase();
    const result = await useCase.execute({
      sessionToken: 'inexistant-token',
      userId,
    });
    expect(result.kind).toBe('no_session');
    const audit = await prisma.authAuditEvent.count({
      where: { targetUserId: userId, eventType: 'logout' },
    });
    expect(audit).toBe(0);
  });

  it('autres sessions du même user restent actives (FR-027)', async () => {
    const { userId, sessionTokens } = await createUserWithSessions();
    const [first, second, third] = sessionTokens;
    if (!first || !second || !third) throw new Error('expected 3 tokens');
    const useCase = buildUseCase();
    await useCase.execute({ sessionToken: first, userId });
    const remaining = await prisma.authSession.findMany({
      where: { userId },
      select: { sessionToken: true },
    });
    expect(remaining).toHaveLength(2);
    const remainingTokens = remaining.map((s) => s.sessionToken).sort();
    expect(remainingTokens).toEqual([second, third].sort());
  });
});
