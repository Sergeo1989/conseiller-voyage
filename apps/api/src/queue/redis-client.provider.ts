// T025 — Provider Redis singleton consommé par BullMQ, IdempotencyInterceptor,
// ThrottlerModule, et tout autre composant nécessitant un accès Redis bas-niveau.

import { type FactoryProvider, Inject, type Provider } from '@nestjs/common';
import { Redis } from 'ioredis';
import { env } from '../env';

export const REDIS_CLIENT = Symbol.for('REDIS_CLIENT');

export const RedisClientProvider: FactoryProvider<Redis> = {
  provide: REDIS_CLIENT,
  useFactory: () =>
    new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: false,
    }),
};

export const REDIS_PROVIDERS: Provider[] = [RedisClientProvider];

export const InjectRedis = (): ParameterDecorator => Inject(REDIS_CLIENT);
