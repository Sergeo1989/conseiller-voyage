// T061 — Adapter Redis : RedisRematchLock.
// SETNX EX (atomic) sur clé `matching:rematch:${briefId}` — empêche un
// double-clic admin de produire deux re-matchings concurrents qui
// corromperaient la superseded chain.

import { Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { REDIS_CLIENT } from '../../../queue/redis-client.provider';
import type {
  RedisRematchLock,
  RematchLockAcquireResult,
} from '../application/ports/redis-rematch-lock.port';

const LOCK_KEY_PREFIX = 'matching:rematch:';

@Injectable()
export class RedisRematchLockAdapter implements RedisRematchLock {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async acquire(briefId: string, ttlMs: number): Promise<RematchLockAcquireResult> {
    // SET key value PX ttl NX — atomic
    const result = await this.redis.set(`${LOCK_KEY_PREFIX}${briefId}`, '1', 'PX', ttlMs, 'NX');
    if (result === 'OK') return { kind: 'acquired' };
    return { kind: 'already_held' };
  }

  async release(briefId: string): Promise<void> {
    await this.redis.del(`${LOCK_KEY_PREFIX}${briefId}`);
  }
}
