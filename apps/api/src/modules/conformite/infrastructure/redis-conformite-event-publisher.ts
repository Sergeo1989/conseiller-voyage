// T096 — RedisConformiteEventPublisher.
//
// Implémentation du port ConformiteEventPublisher via Redis pub/sub :
//   - publish() : appelé par OutboxPublisherJob, PUBLISH sur canal
//     env.CONFORMITE_PUBSUB_CHANNEL (défaut 'conformite.status.changed')
//   - subscribe() : SUBSCRIBE pour les consommateurs internes
//     (cache invalidation, matching, SEO)
//
// On utilise DEUX clients ioredis distincts car SUBSCRIBE bloque le
// client (mode pub/sub) — le client de publish reste libre pour
// d'autres opérations.

import { Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { REDIS_CLIENT } from '../../../common/interceptors/idempotency.interceptor';
import { env } from '../../../env';
import type {
  ConformiteDomainEvent,
  ConformiteEventPublisher,
  EventHandler,
  Unsubscribe,
} from '../application/ports/conformite-event-publisher.port';

@Injectable()
export class RedisConformiteEventPublisher implements ConformiteEventPublisher {
  private readonly subscriberClient: Redis;
  private readonly handlers = new Set<EventHandler>();
  private subscribed = false;

  constructor(@Inject(REDIS_CLIENT) private readonly publisherClient: Redis) {
    // Clone la config pour avoir un client subscribe-only
    this.subscriberClient = publisherClient.duplicate();
  }

  async publish(event: ConformiteDomainEvent): Promise<void> {
    await this.publisherClient.publish(env.CONFORMITE_PUBSUB_CHANNEL, JSON.stringify(event));
  }

  subscribe(handler: EventHandler): Unsubscribe {
    this.handlers.add(handler);
    void this.ensureSubscribed();
    return () => {
      this.handlers.delete(handler);
    };
  }

  private async ensureSubscribed(): Promise<void> {
    if (this.subscribed) return;
    this.subscribed = true;
    await this.subscriberClient.subscribe(env.CONFORMITE_PUBSUB_CHANNEL);
    this.subscriberClient.on('message', (_channel, message) => {
      try {
        const event = JSON.parse(message) as ConformiteDomainEvent;
        for (const handler of this.handlers) {
          void Promise.resolve(handler(event)).catch(() => {
            // Erreurs handler ne doivent pas casser la boucle
          });
        }
      } catch {
        // Message mal formé — ignoré silencieusement
      }
    });
  }
}
