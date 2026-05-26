// Adapter Postgres du port MfaRateLimiter.
// P0-2 : INSERT ... ON CONFLICT DO UPDATE atomique via $queryRaw.

import { type Prisma, prisma } from '@cv/db';
import { Injectable } from '@nestjs/common';
import type {
  MfaRateLimitKind,
  MfaRateLimiter,
  RateLimitResult,
} from '../application/ports/mfa-rate-limiter.port';

interface PolicyConfig {
  readonly windowSec: number;
  readonly threshold: number;
  readonly lockoutSec: number;
}

const POLICIES: Record<MfaRateLimitKind, PolicyConfig> = {
  // FR-013 : 5 échecs en 5 min → lockout 15 min
  login_totp: { windowSec: 300, threshold: 5, lockoutSec: 900 },
  // FR-020 : 3 échecs dans un modal → session killed (lockoutSec
  // symbolique — la session est tuée côté caller)
  stepup_totp: { windowSec: 300, threshold: 3, lockoutSec: 60 },
  // P1-1 : 10 starts max par heure
  enroll_start: { windowSec: 3600, threshold: 10, lockoutSec: 3600 },
  // 5 échecs en 10 min sur la re-auth forte du device change
  device_change: { windowSec: 600, threshold: 5, lockoutSec: 1800 },
};

@Injectable()
export class PostgresMfaRateLimiter implements MfaRateLimiter {
  async recordAttempt(
    userId: string,
    kind: MfaRateLimitKind,
    sessionId: string | null,
  ): Promise<RateLimitResult> {
    const policy = POLICIES[kind];

    // P0-2 : atomic INSERT ... ON CONFLICT DO UPDATE.
    // 2 chemins selon sessionId IS NULL ou pas (ON CONFLICT cible le
    // bon index unique partiel).
    const rows = sessionId
      ? await prisma.$queryRaw<{ attempts: number; lockedUntil: Date | null }[]>`
          INSERT INTO mfa_rate_limit_buckets (id, "userId", kind, "sessionId", "windowStartedAt", "windowEndsAt", attempts, "updatedAt")
          VALUES (gen_random_uuid(), ${userId}::uuid, ${kind}::"MfaRateLimitKind", ${sessionId}::uuid, NOW(), NOW() + (${policy.windowSec}::int * INTERVAL '1 second'), 1, NOW())
          ON CONFLICT ("userId", kind, "sessionId") WHERE "sessionId" IS NOT NULL DO UPDATE SET
            attempts = CASE
              WHEN mfa_rate_limit_buckets."windowEndsAt" < NOW() THEN 1
              ELSE mfa_rate_limit_buckets.attempts + 1
            END,
            "windowStartedAt" = CASE
              WHEN mfa_rate_limit_buckets."windowEndsAt" < NOW() THEN NOW()
              ELSE mfa_rate_limit_buckets."windowStartedAt"
            END,
            "windowEndsAt" = CASE
              WHEN mfa_rate_limit_buckets."windowEndsAt" < NOW() THEN NOW() + (${policy.windowSec}::int * INTERVAL '1 second')
              ELSE mfa_rate_limit_buckets."windowEndsAt"
            END,
            "lockedUntil" = CASE
              WHEN (CASE WHEN mfa_rate_limit_buckets."windowEndsAt" < NOW() THEN 1 ELSE mfa_rate_limit_buckets.attempts + 1 END) >= ${policy.threshold}
              THEN NOW() + (${policy.lockoutSec}::int * INTERVAL '1 second')
              ELSE mfa_rate_limit_buckets."lockedUntil"
            END,
            "updatedAt" = NOW()
          RETURNING attempts, "lockedUntil" AS "lockedUntil"
        `
      : await prisma.$queryRaw<{ attempts: number; lockedUntil: Date | null }[]>`
          INSERT INTO mfa_rate_limit_buckets (id, "userId", kind, "sessionId", "windowStartedAt", "windowEndsAt", attempts, "updatedAt")
          VALUES (gen_random_uuid(), ${userId}::uuid, ${kind}::"MfaRateLimitKind", NULL, NOW(), NOW() + (${policy.windowSec}::int * INTERVAL '1 second'), 1, NOW())
          ON CONFLICT ("userId", kind) WHERE "sessionId" IS NULL DO UPDATE SET
            attempts = CASE
              WHEN mfa_rate_limit_buckets."windowEndsAt" < NOW() THEN 1
              ELSE mfa_rate_limit_buckets.attempts + 1
            END,
            "windowStartedAt" = CASE
              WHEN mfa_rate_limit_buckets."windowEndsAt" < NOW() THEN NOW()
              ELSE mfa_rate_limit_buckets."windowStartedAt"
            END,
            "windowEndsAt" = CASE
              WHEN mfa_rate_limit_buckets."windowEndsAt" < NOW() THEN NOW() + (${policy.windowSec}::int * INTERVAL '1 second')
              ELSE mfa_rate_limit_buckets."windowEndsAt"
            END,
            "lockedUntil" = CASE
              WHEN (CASE WHEN mfa_rate_limit_buckets."windowEndsAt" < NOW() THEN 1 ELSE mfa_rate_limit_buckets.attempts + 1 END) >= ${policy.threshold}
              THEN NOW() + (${policy.lockoutSec}::int * INTERVAL '1 second')
              ELSE mfa_rate_limit_buckets."lockedUntil"
            END,
            "updatedAt" = NOW()
          RETURNING attempts, "lockedUntil" AS "lockedUntil"
        `;

    const row = rows[0];
    if (!row) {
      // Cas impossible théorique — INSERT ON CONFLICT retourne toujours
      // une ligne. Si on arrive ici, c'est un bug ou un changement
      // d'API Prisma.
      throw new Error('PostgresMfaRateLimiter: empty RETURNING — bug');
    }
    return { attempts: row.attempts, lockedUntil: row.lockedUntil };
  }

  async isLocked(
    userId: string,
    kind: MfaRateLimitKind,
    sessionId: string | null,
  ): Promise<{ locked: boolean; unlockAt: Date | null }> {
    const where: Prisma.MfaRateLimitBucketWhereInput = sessionId
      ? { userId, kind, sessionId }
      : { userId, kind, sessionId: null };
    const row = await prisma.mfaRateLimitBucket.findFirst({ where });
    if (!row) return { locked: false, unlockAt: null };
    const locked = row.lockedUntil !== null && row.lockedUntil > new Date();
    return { locked, unlockAt: locked ? row.lockedUntil : null };
  }

  async reset(userId: string, kind: MfaRateLimitKind, sessionId: string | null): Promise<void> {
    const where: Prisma.MfaRateLimitBucketWhereInput = sessionId
      ? { userId, kind, sessionId }
      : { userId, kind, sessionId: null };
    await prisma.mfaRateLimitBucket.deleteMany({ where });
  }
}
