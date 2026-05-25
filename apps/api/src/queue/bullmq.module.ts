// T025 — Module BullMQ pour les jobs asynchrones (notifications, expiration
// sweep, outbox publisher, etc.).
// Les workers et queues spécifiques aux features (ex: expiration-sweep.job.ts
// dans modules/conformite/infrastructure/jobs/) s'enregistrent via
// BullModule.registerQueue() dans leur propre module.

import { BullModule as NestBullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { env } from '../env';
import { REDIS_PROVIDERS } from './redis-client.provider';

@Module({
  imports: [
    NestBullModule.forRootAsync({
      useFactory: () => {
        const url = new URL(env.REDIS_URL);
        return {
          connection: {
            host: url.hostname,
            port: Number(url.port || 6379),
            password: url.password || undefined,
          },
          defaultJobOptions: {
            attempts: 5,
            backoff: { type: 'exponential', delay: 5_000 },
            removeOnComplete: { age: 24 * 3600, count: 1_000 },
            removeOnFail: { age: 7 * 24 * 3600 },
          },
        };
      },
    }),
  ],
  providers: [...REDIS_PROVIDERS],
  exports: [NestBullModule, ...REDIS_PROVIDERS],
})
export class BullMqModule {}
