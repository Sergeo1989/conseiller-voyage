// T051 — PrismaLoginLockoutRepository (feature 002 / R4).
//
// Pattern atomique INSERT ON CONFLICT DO UPDATE — hérité de 002a (P0-2
// race condition résolue). Fenêtres glissantes : si le bucket est plus
// vieux que `windowSec`, on reset le compteur à 1 et on repart.

import { prisma } from '@cv/db';
import { Injectable } from '@nestjs/common';
import type {
  LockoutBucketKind,
  LockoutBucketSnapshot,
  LoginLockoutRepository,
} from '../application/ports/login-lockout-repository.port';

interface RawBucketRow {
  readonly failureCount: number;
  readonly windowStartAt: Date;
}

@Injectable()
export class PrismaLoginLockoutRepository implements LoginLockoutRepository {
  async incrementAtomic(input: {
    readonly kind: LockoutBucketKind;
    readonly accountId: string | null;
    readonly ipHash: Buffer | null;
    readonly windowSec: number;
    readonly now: Date;
  }): Promise<LockoutBucketSnapshot> {
    // INSERT ... ON CONFLICT (kind, accountId, ipHash) DO UPDATE SET
    //   failureCount = (window expired ? 1 : count + 1)
    //   windowStartAt = (window expired ? NOW : keep)
    //   lastFailureAt = NOW
    // RETURNING failureCount, windowStartAt;
    const rows = await prisma.$queryRaw<RawBucketRow[]>`
      INSERT INTO "auth_login_lockout_buckets"
        ("id", "kind", "accountId", "ipHash", "failureCount", "windowStartAt", "lastFailureAt")
      VALUES (gen_random_uuid(), ${input.kind}::"LoginLockoutKind", ${input.accountId}::uuid, ${input.ipHash}, 1, ${input.now}, ${input.now})
      ON CONFLICT ("kind", "accountId", "ipHash") DO UPDATE SET
        "failureCount" = CASE
          WHEN "auth_login_lockout_buckets"."windowStartAt" < ${input.now} - (${input.windowSec} || ' seconds')::interval
          THEN 1
          ELSE "auth_login_lockout_buckets"."failureCount" + 1
        END,
        "windowStartAt" = CASE
          WHEN "auth_login_lockout_buckets"."windowStartAt" < ${input.now} - (${input.windowSec} || ' seconds')::interval
          THEN ${input.now}
          ELSE "auth_login_lockout_buckets"."windowStartAt"
        END,
        "lastFailureAt" = ${input.now}
      RETURNING "failureCount", "windowStartAt";
    `;
    const row = rows[0];
    if (!row) {
      throw new Error('PrismaLoginLockoutRepository.incrementAtomic returned no row');
    }
    return { failureCount: row.failureCount, windowStartAt: row.windowStartAt };
  }

  async read(input: {
    readonly kind: LockoutBucketKind;
    readonly accountId: string | null;
    readonly ipHash: Buffer | null;
  }): Promise<LockoutBucketSnapshot | null> {
    const row = await prisma.loginLockoutBucket.findFirst({
      where: {
        kind: input.kind,
        accountId: input.accountId,
        ipHash: input.ipHash,
      },
      select: { failureCount: true, windowStartAt: true },
    });
    return row;
  }

  async reset(input: {
    readonly kind: LockoutBucketKind;
    readonly accountId: string | null;
    readonly ipHash: Buffer | null;
  }): Promise<void> {
    await prisma.loginLockoutBucket.deleteMany({
      where: {
        kind: input.kind,
        accountId: input.accountId,
        ipHash: input.ipHash,
      },
    });
  }
}
