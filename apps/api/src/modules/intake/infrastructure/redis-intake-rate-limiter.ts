// T051 [US1] — RedisIntakeRateLimiter (FR-019 + FR-020 + FR-020a).
//
// Sliding window 24h via Redis sorted sets :
//   - intake:rl:email:<email-lowercase> — scores = timestamps ms
//   - intake:rl:ip:<ip> — scores = timestamps ms
//
// Sur check :
//   1. ZREMRANGEBYSCORE 0..(now-24h) — purge entrées hors fenêtre
//   2. ZCARD → comptage courant
//   3. Évalue email-first (FR-020a) puis IP-second
//   4. Si OK, ZADD nowMs ; sinon, retourne reason + retryAfterSeconds
//
// La source de vérité est ici (Redis). Les colonnes briefsCount24h /
// briefsCount24hWindowStart de VoyageurContact sont des miroirs
// diagnostiques (N5 résolu).

import { Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { REDIS_CLIENT } from '../../../common/interceptors/idempotency.interceptor';
import { env } from '../../../env';
import type { IntakeRateLimiter, RateLimitInput, RateLimitOutcome } from '../application/ports';

const EMAIL_KEY_PREFIX = 'intake:rl:email:';
const IP_KEY_PREFIX = 'intake:rl:ip:';
const WINDOW_MS = 24 * 60 * 60 * 1000;
// TTL > fenêtre = défense en profondeur si une clé n'est plus jamais
// touchée (auto-cleanup ; les ZREMRANGEBYSCORE assurent la justesse).
const KEY_TTL_SECONDS = 25 * 60 * 60;

@Injectable()
export class RedisIntakeRateLimiter implements IntakeRateLimiter {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async checkAndIncrement(input: RateLimitInput): Promise<RateLimitOutcome> {
    const emailLimit = env.INTAKE_RATE_LIMIT_EMAIL_PER_24H;
    const ipLimit = env.INTAKE_RATE_LIMIT_IP_PER_24H;
    const cutoff = input.nowMs - WINDOW_MS;

    const emailKey = `${EMAIL_KEY_PREFIX}${input.email.toLowerCase()}`;
    const emailCount = await this.purgeAndCount(emailKey, cutoff);
    if (emailCount >= emailLimit) {
      const earliestEmail = await this.earliestScore(emailKey);
      return {
        allowed: false,
        reason: 'email',
        retryAfterSeconds: Math.max(1, Math.ceil((earliestEmail + WINDOW_MS - input.nowMs) / 1000)),
      };
    }

    if (input.clientIp) {
      const ipKey = `${IP_KEY_PREFIX}${input.clientIp}`;
      const ipCount = await this.purgeAndCount(ipKey, cutoff);
      if (ipCount >= ipLimit) {
        const earliestIp = await this.earliestScore(ipKey);
        return {
          allowed: false,
          reason: 'ip',
          retryAfterSeconds: Math.max(1, Math.ceil((earliestIp + WINDOW_MS - input.nowMs) / 1000)),
        };
      }
      // Incrément IP
      const memberIp = `${input.nowMs}:${Math.random().toString(36).slice(2, 8)}`;
      await this.redis.zadd(ipKey, input.nowMs, memberIp);
      await this.redis.expire(ipKey, KEY_TTL_SECONDS);
    }

    // Incrément email (en dernier — si l'IP a bloqué, on n'incrémente
    // pas l'email).
    const memberEmail = `${input.nowMs}:${Math.random().toString(36).slice(2, 8)}`;
    await this.redis.zadd(emailKey, input.nowMs, memberEmail);
    await this.redis.expire(emailKey, KEY_TTL_SECONDS);

    return { allowed: true };
  }

  private async purgeAndCount(key: string, cutoff: number): Promise<number> {
    await this.redis.zremrangebyscore(key, 0, cutoff);
    return this.redis.zcard(key);
  }

  private async earliestScore(key: string): Promise<number> {
    const earliest = await this.redis.zrange(key, 0, 0, 'WITHSCORES');
    if (earliest.length < 2) return Date.now();
    return Number.parseInt(earliest[1] ?? '0', 10);
  }
}
