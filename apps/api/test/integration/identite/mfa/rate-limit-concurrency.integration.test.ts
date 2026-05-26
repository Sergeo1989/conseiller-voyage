// T058 — Test P0-2 : incréments concurrents du compteur de rate limit
// sont atomiques (INSERT ... ON CONFLICT DO UPDATE) — aucune perte.
//
// Sans atomicité (lecture-puis-écriture naïve), 10 incréments parallèles
// → 10 reads voient attempts=N, 10 writes settle à N+1 (perte de 9
// incréments). Le test vérifie qu'on arrive bien à 10.

import { prisma } from '@cv/db';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { PostgresMfaRateLimiter } from '../../../../src/modules/identite/infrastructure/postgres-mfa-rate-limiter';

const TEST_USER_ID = '00000000-0000-4000-8000-aaaa00000001';

async function teardown(): Promise<void> {
  await prisma.mfaRateLimitBucket.deleteMany({ where: { userId: TEST_USER_ID } });
  await prisma.authUser.deleteMany({ where: { id: TEST_USER_ID } });
}

async function setupUser(): Promise<void> {
  await teardown();
  await prisma.authUser.create({
    data: {
      id: TEST_USER_ID,
      email: `rate-${Date.now()}@example.test`,
      role: 'conseiller',
    },
  });
}

describe('PostgresMfaRateLimiter atomicité (P0-2)', () => {
  const limiter = new PostgresMfaRateLimiter();

  beforeEach(async () => {
    await setupUser();
  });
  afterAll(async () => {
    await teardown();
  });

  it('10 incréments parallèles → attempts = 10 (pas de perte)', async () => {
    const results = await Promise.all(
      Array.from({ length: 10 }, () => limiter.recordAttempt(TEST_USER_ID, 'login_totp', null)),
    );
    // Le dernier result.attempts doit être 10 (ou un sous-ensemble si
    // exactement N incréments ont été appliqués atomiquement).
    const finalAttempts = await prisma.mfaRateLimitBucket.findFirst({
      where: { userId: TEST_USER_ID, kind: 'login_totp', sessionId: null },
    });
    expect(finalAttempts?.attempts).toBe(10);
    // Tous les résultats individuels doivent être ≥ 1 et ≤ 10
    for (const r of results) {
      expect(r.attempts).toBeGreaterThanOrEqual(1);
      expect(r.attempts).toBeLessThanOrEqual(10);
    }
  });

  it('lockedUntil posé après le 5ème échec login_totp', async () => {
    // 5 incréments séquentiels — au 5ème, lockedUntil doit être posé.
    let last: { attempts: number; lockedUntil: Date | null } | undefined;
    for (let i = 0; i < 5; i++) {
      last = await limiter.recordAttempt(TEST_USER_ID, 'login_totp', null);
    }
    expect(last?.attempts).toBe(5);
    expect(last?.lockedUntil).not.toBeNull();
    expect(last?.lockedUntil?.getTime()).toBeGreaterThan(Date.now());
  });

  it('scoping par session : buckets indépendants (P0-3)', async () => {
    const SESSION_A = '00000000-0000-4000-8000-aaaa00000003';
    const SESSION_B = '00000000-0000-4000-8000-aaaa00000004';
    // 2 incréments dans la session A, 1 dans la session B
    await limiter.recordAttempt(TEST_USER_ID, 'stepup_totp', SESSION_A);
    await limiter.recordAttempt(TEST_USER_ID, 'stepup_totp', SESSION_A);
    const b = await limiter.recordAttempt(TEST_USER_ID, 'stepup_totp', SESSION_B);

    expect(b.attempts).toBe(1); // bucket B indépendant

    const bucketA = await prisma.mfaRateLimitBucket.findFirst({
      where: { userId: TEST_USER_ID, kind: 'stepup_totp', sessionId: SESSION_A },
    });
    expect(bucketA?.attempts).toBe(2);
  });

  it('reset() vide le bucket', async () => {
    await limiter.recordAttempt(TEST_USER_ID, 'login_totp', null);
    await limiter.recordAttempt(TEST_USER_ID, 'login_totp', null);
    await limiter.reset(TEST_USER_ID, 'login_totp', null);
    const bucket = await prisma.mfaRateLimitBucket.findFirst({
      where: { userId: TEST_USER_ID, kind: 'login_totp', sessionId: null },
    });
    expect(bucket).toBeNull();
  });
});
