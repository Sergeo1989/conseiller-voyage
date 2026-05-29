// T094 — Integration tests RedisIntakeRateLimiter.
//
// Vérifie la sliding window 24h sur un vrai Redis local (compteurs
// séparés par email/IP, ordre eval email-first/IP-second FR-020a Q2).
//
// PRÉREQUIS : pnpm docker:up (Redis sur :6379). Skip si pas disponible.

import { Redis } from 'ioredis';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { RedisIntakeRateLimiter } from '../../../src/modules/intake/infrastructure/redis-intake-rate-limiter';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
const EMAIL_KEY_PREFIX = 'intake:rl:email:';
const IP_KEY_PREFIX = 'intake:rl:ip:';

async function redisAvailable(): Promise<boolean> {
  const r = new Redis(REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1 });
  try {
    await r.connect();
    await r.ping();
    await r.quit();
    return true;
  } catch {
    return false;
  }
}

describe('RedisIntakeRateLimiter (integration)', () => {
  let redis: Redis;
  let limiter: RedisIntakeRateLimiter;
  let skipAll = false;
  const TEST_EMAIL = 'rl-test@example.com';
  const TEST_IP = '203.0.113.99';

  beforeAll(async () => {
    if (!(await redisAvailable())) {
      skipAll = true;
      return;
    }
    redis = new Redis(REDIS_URL);
    limiter = new RedisIntakeRateLimiter(redis);
  });

  afterAll(async () => {
    if (skipAll) return;
    await redis.del(`${EMAIL_KEY_PREFIX}${TEST_EMAIL}`);
    await redis.del(`${IP_KEY_PREFIX}${TEST_IP}`);
    await redis.quit();
  });

  beforeEach(async () => {
    if (skipAll) return;
    await redis.del(`${EMAIL_KEY_PREFIX}${TEST_EMAIL}`);
    await redis.del(`${IP_KEY_PREFIX}${TEST_IP}`);
  });

  it.skipIf(skipAll)('autorise les 3 premières soumissions par email', async () => {
    for (let i = 0; i < 3; i++) {
      const r = await limiter.checkAndIncrement({
        email: TEST_EMAIL,
        clientIp: TEST_IP,
        nowMs: Date.now(),
      });
      expect(r.allowed).toBe(true);
    }
  });

  it.skipIf(skipAll)('refuse EMAIL_RATE_LIMIT à la 4e soumission même email', async () => {
    for (let i = 0; i < 3; i++) {
      await limiter.checkAndIncrement({
        email: TEST_EMAIL,
        clientIp: null,
        nowMs: Date.now(),
      });
    }
    const r = await limiter.checkAndIncrement({
      email: TEST_EMAIL,
      clientIp: null,
      nowMs: Date.now(),
    });
    expect(r.allowed).toBe(false);
    if (!r.allowed) {
      expect(r.reason).toBe('email');
      expect(r.retryAfterSeconds).toBeGreaterThan(0);
    }
  });

  it.skipIf(skipAll)(
    'FR-020a Q2 — email-first ordering : si hit email ET IP, retourne reason=email',
    async () => {
      // Saturate email + IP separately puis test cumulé
      for (let i = 0; i < 3; i++) {
        await limiter.checkAndIncrement({
          email: TEST_EMAIL,
          clientIp: TEST_IP,
          nowMs: Date.now(),
        });
      }
      // Maintenant l'email est à 3. La 4e devrait fail email-first.
      const r = await limiter.checkAndIncrement({
        email: TEST_EMAIL,
        clientIp: TEST_IP,
        nowMs: Date.now(),
      });
      expect(r.allowed).toBe(false);
      if (!r.allowed) {
        expect(r.reason).toBe('email');
      }
    },
  );

  it.skipIf(skipAll)(
    'refuse RATE_LIMIT (IP) à la 6e soumission même IP, emails différents',
    async () => {
      for (let i = 0; i < 5; i++) {
        await limiter.checkAndIncrement({
          email: `unique-${i}@example.com`,
          clientIp: TEST_IP,
          nowMs: Date.now(),
        });
      }
      const r = await limiter.checkAndIncrement({
        email: 'unique-6@example.com',
        clientIp: TEST_IP,
        nowMs: Date.now(),
      });
      expect(r.allowed).toBe(false);
      if (!r.allowed) {
        expect(r.reason).toBe('ip');
      }
      // Cleanup IP key + 6 email keys
      for (let i = 0; i < 6; i++) {
        await redis.del(`${EMAIL_KEY_PREFIX}unique-${i}@example.com`);
      }
    },
  );

  it.skipIf(skipAll)(
    'autorise à nouveau après expiration de la fenêtre 24h (simulé via nowMs avancé)',
    async () => {
      const t0 = Date.now();
      for (let i = 0; i < 3; i++) {
        await limiter.checkAndIncrement({
          email: TEST_EMAIL,
          clientIp: null,
          nowMs: t0,
        });
      }
      // Avance virtuelle de 25h
      const t1 = t0 + 25 * 60 * 60 * 1000;
      const r = await limiter.checkAndIncrement({
        email: TEST_EMAIL,
        clientIp: null,
        nowMs: t1,
      });
      expect(r.allowed).toBe(true);
    },
  );
});
