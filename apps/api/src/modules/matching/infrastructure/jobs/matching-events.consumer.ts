// T029 [US1] — MatchingEventsConsumer.
//
// S'abonne au canal Redis pub/sub `env.MATCHING_PUBSUB_CHANNEL` (`matching.events`,
// publié par 011/T093), route chaque message par `name` (kebab-case) vers
// ConsumeMatchingEventUseCase, puis déclenche le dispatch des notifications.
//
// Le pub/sub est lossy (ADR-0026) — le LeadReconciliationScheduler (Phase 5)
// garantit la complétude en mode dégradé « bus HS ». Idempotence : dédup
// `consumed_matching_events` + contraintes UNIQUE DB.
//
// Pattern d'abonnement hérité de RedisConformiteEventPublisher (001).

import { assertMatchingEventBusName } from '@cv/shared/matching';
import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import type { Redis } from 'ioredis';
import { REDIS_CLIENT } from '../../../../common/interceptors/idempotency.interceptor';
import { env } from '../../../../env';
import { ConsumeMatchingEventUseCase } from '../../application/use-cases/consume-matching-event.use-case';
import { LeadNotificationDispatcher } from './lead-notification.job';

@Injectable()
export class MatchingEventsConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MatchingEventsConsumer.name);
  private subscriber?: Redis;

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @Inject(ConsumeMatchingEventUseCase)
    private readonly consumeUseCase: ConsumeMatchingEventUseCase,
    @Inject(LeadNotificationDispatcher)
    private readonly dispatcher: LeadNotificationDispatcher,
  ) {}

  onModuleInit(): void {
    // Une connexion dédiée en mode subscribe (ioredis : une connexion abonnée
    // ne peut plus exécuter d'autres commandes).
    this.subscriber = this.redis.duplicate();
    void this.subscriber.subscribe(env.MATCHING_PUBSUB_CHANNEL);
    this.subscriber.on('message', (_channel, message) => {
      void this.handleMessage(message);
    });
    this.logger.log(`Abonné au canal ${env.MATCHING_PUBSUB_CHANNEL}`);
  }

  async onModuleDestroy(): Promise<void> {
    if (this.subscriber) await this.subscriber.quit();
  }

  /** Public pour les tests d'intégration (injection directe d'un message). */
  async handleMessage(raw: string): Promise<void> {
    let parsed: { name: string; idempotencyKey: string; payload: unknown };
    try {
      parsed = JSON.parse(raw);
    } catch {
      this.logger.error(`Message bus non-JSON ignoré: ${raw.slice(0, 120)}`);
      return;
    }
    try {
      const name = assertMatchingEventBusName(parsed.name);
      const result = await this.consumeUseCase.execute({
        name,
        idempotencyKey: parsed.idempotencyKey,
        payload: parsed.payload,
      });
      if (result.kind === 'processed') {
        // Enfile un job BullMQ par destinataire pour les notifications pending.
        await this.dispatcher.dispatchPending();
      }
    } catch (error) {
      this.logger.error(
        `Échec traitement event ${parsed.name} (${parsed.idempotencyKey}): ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
