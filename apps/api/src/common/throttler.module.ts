// T024 — Rate limiter @nestjs/throttler avec backing Redis.
// Limites par défaut : 100 req/min/IP. Endpoints sensibles (intake,
// admin actions) appliqueront un @Throttle() plus strict — défini dans
// http-endpoints.md.

import { Module } from '@nestjs/common';
import { ThrottlerModule as NestThrottlerModule } from '@nestjs/throttler';
import { Redis } from 'ioredis';
import { ThrottlerStorageRedisService } from 'nestjs-throttler-storage-redis';
import { env } from '../env';

@Module({
  imports: [
    NestThrottlerModule.forRootAsync({
      useFactory: () => ({
        throttlers: [{ ttl: 60_000, limit: 100 }],
        storage: new ThrottlerStorageRedisService(new Redis(env.REDIS_URL)),
      }),
    }),
  ],
  exports: [NestThrottlerModule],
})
export class ThrottlerModule {}
