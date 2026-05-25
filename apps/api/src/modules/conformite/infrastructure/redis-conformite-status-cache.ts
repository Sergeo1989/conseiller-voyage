// T095 — RedisConformiteStatusCache adapter.
//
// Implémente ConformiteStatusCache via Redis (TTL configurable via
// env.CONFORMITE_STATUS_CACHE_TTL_SECONDS, défaut 60).
//
// Pattern :
//   - get/set : SETEX avec TTL
//   - invalidate : DEL explicite (déclenché par event status.changed)
// La fraîcheur < 60s est garantie par le TTL ; la propagation négative
// < 10s par l'invalidate côté publisher Redis pub/sub (T096).

import type { ConseillerId } from '@cv/shared/conformite';
import { Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { REDIS_CLIENT } from '../../../common/interceptors/idempotency.interceptor';
import { env } from '../../../env';
import type {
  ConformiteStatusCache,
  VerificationStatus,
} from '../application/ports/conformite-status-cache.port';

const KEY_PREFIX = 'conformite:status:';

interface SerializedStatus {
  conseillerId: string;
  verified: boolean;
  lastVerifiedAt: string | null;
}

@Injectable()
export class RedisConformiteStatusCache implements ConformiteStatusCache {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async get(conseillerId: ConseillerId): Promise<VerificationStatus | null> {
    const raw = await this.redis.get(this.key(conseillerId));
    if (raw === null) return null;
    const parsed = JSON.parse(raw) as SerializedStatus;
    return {
      conseillerId: parsed.conseillerId as ConseillerId,
      verified: parsed.verified,
      lastVerifiedAt: parsed.lastVerifiedAt ? new Date(parsed.lastVerifiedAt) : null,
    };
  }

  async set(status: VerificationStatus): Promise<void> {
    const serialized: SerializedStatus = {
      conseillerId: status.conseillerId,
      verified: status.verified,
      lastVerifiedAt: status.lastVerifiedAt?.toISOString() ?? null,
    };
    await this.redis.setex(
      this.key(status.conseillerId),
      env.CONFORMITE_STATUS_CACHE_TTL_SECONDS,
      JSON.stringify(serialized),
    );
  }

  async invalidate(conseillerId: ConseillerId): Promise<void> {
    await this.redis.del(this.key(conseillerId));
  }

  private key(conseillerId: ConseillerId): string {
    return `${KEY_PREFIX}${conseillerId}`;
  }
}
