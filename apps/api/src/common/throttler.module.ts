// T024 — Rate limiter @nestjs/throttler avec backing Redis.
// Limites par défaut : 100 req/min/IP. Endpoints sensibles (intake,
// admin actions) appliqueront un @Throttle() plus strict — défini dans
// http-endpoints.md.
//
// Note shutdown : on absorbe « Connection is closed. » sur le client interne
// du Throttler pour la même raison que redis-client.provider.ts — éviter les
// unhandled rejections au app.close() qui faisaient tomber Vitest 2 en CI.

import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { Module } from '@nestjs/common';
import { ThrottlerModule as NestThrottlerModule } from '@nestjs/throttler';
import { Redis } from 'ioredis';
import { env } from '../env';

@Module({
  imports: [
    NestThrottlerModule.forRootAsync({
      useFactory: () => {
        const throttlerRedis = new Redis(env.REDIS_URL);
        throttlerRedis.on('error', (err: Error) => {
          if (err.message === 'Connection is closed.') return;
        });
        return {
          throttlers: [{ ttl: 60_000, limit: 100 }],
          storage: new ThrottlerStorageRedisService(throttlerRedis),
        };
      },
    }),
  ],
  exports: [NestThrottlerModule],
})
export class ThrottlerModule {}
