// T025 — Provider Redis singleton consommé par BullMQ, IdempotencyInterceptor,
// ThrottlerModule, et tout autre composant nécessitant un accès Redis bas-niveau.
//
// Lifecycle :
//   - L'instance retournée par la factory expose un `onModuleDestroy` (duck-typé
//     par NestJS) qui déclenche `client.quit()` au shutdown. Sans cela, les
//     commandes en vol au moment de `app.close()` (heartbeats BullMQ, idempotency
//     cache, throttler) rejettent avec « Connection is closed. » et deviennent
//     des unhandled rejections — ce qui faisait tomber Vitest 2 en CI même quand
//     tous les tests passaient.
//   - Un listener `error` absorbe silencieusement la même erreur après le
//     `quit()` (l'événement 'close' arrive APRÈS le drain de la queue mais peut
//     encore émettre 'error' une fois).

import { type FactoryProvider, Inject, type Provider } from '@nestjs/common';
import { Redis } from 'ioredis';
import { env } from '../env';

export const REDIS_CLIENT = Symbol.for('REDIS_CLIENT');

type ManagedRedis = Redis & { onModuleDestroy?: () => Promise<void> };

export const RedisClientProvider: FactoryProvider<Redis> = {
  provide: REDIS_CLIENT,
  useFactory: (): Redis => {
    const client = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: false,
    }) as ManagedRedis;

    // Absorbe les erreurs post-shutdown (socket fermé pendant qu'une commande
    // était en file d'attente). N'affecte pas le runtime — en cas de panne
    // Redis applicative, les erreurs remontent toujours via les promesses
    // rejetées des appels Redis utilisateur.
    client.on('error', (err: Error) => {
      if (err.message === 'Connection is closed.') return;
    });

    // NestJS détecte la méthode par duck-typing — pas besoin d'implémenter
    // une interface (Redis n'a pas vocation à étendre OnModuleDestroy).
    client.onModuleDestroy = async () => {
      try {
        await client.quit();
      } catch {
        // Already disconnected
      }
    };

    return client;
  },
};

export const REDIS_PROVIDERS: Provider[] = [RedisClientProvider];

export const InjectRedis = (): ParameterDecorator => Inject(REDIS_CLIENT);
