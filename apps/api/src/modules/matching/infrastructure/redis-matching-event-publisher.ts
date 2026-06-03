// T093 — RedisMatchingEventPublisher : publication pub/sub Redis des events
// matching drainés depuis `matching_outbox_entries`.
//
// PUBLISH sur le canal `env.MATCHING_PUBSUB_CHANNEL` (défaut `matching.events`).
// Le message est `{ name, idempotencyKey, payload }` sérialisé JSON ; les
// consommateurs (012 notifications, US5 admin 008) routent par `name`
// (kebab-case) et dédupliquent par `idempotencyKey` (livraison at-least-once).
//
// Pattern hérité de RedisConformiteEventPublisher (feature 001).

import { Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { REDIS_CLIENT } from '../../../common/interceptors/idempotency.interceptor';
import { env } from '../../../env';
import type {
  MatchingBusEvent,
  MatchingEventPublisher,
} from '../application/ports/matching-event-publisher.port';

@Injectable()
export class RedisMatchingEventPublisher implements MatchingEventPublisher {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async publish(event: MatchingBusEvent): Promise<void> {
    await this.redis.publish(
      env.MATCHING_PUBSUB_CHANNEL,
      JSON.stringify({
        name: event.name,
        idempotencyKey: event.idempotencyKey,
        payload: event.payload,
      }),
    );
  }
}
