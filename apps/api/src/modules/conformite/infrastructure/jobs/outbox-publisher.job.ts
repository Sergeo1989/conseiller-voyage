// T066 — OutboxPublisherJob.
// BullMQ worker qui draine la table conformite_outbox.
//
// Cycle :
//   1. Scan : SELECT publishedAt IS NULL AND (nextAttemptAt IS NULL
//      OR nextAttemptAt < NOW()) ORDER BY createdAt ASC LIMIT 100.
//   2. Pour chaque row : appelle ConformiteEventPublisher.publish.
//   3. Succès → UPDATE publishedAt = NOW().
//   4. Échec → UPDATE attempts++, nextAttemptAt = backoff exponentiel,
//      lastError = e.message. Au-delà de 10 attempts → log ERROR
//      (dead-letter manuel pour MVP, alerte Sentry).
//
// Garanties at-least-once : le publisher peut être appelé plusieurs
// fois pour le même événement (réseau lent, crash entre publish et
// UPDATE). Les consommateurs DOIVENT être idempotents (clé d'idempotence
// = OutboxEntry.id, propagée comme correlationId côté consommateur).
//
// Cf. research.md R7 (pattern outbox) + plan.md *Modes dégradés*.

import { prisma } from '@cv/db';
import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  CONFORMITE_EVENT_PUBLISHER,
  type ConformiteDomainEvent,
  type ConformiteEventPublisher,
} from '../../application/ports/conformite-event-publisher.port';

/** Backoff par tentative (1-indexed). Dépassé → dead-letter. */
const BACKOFF_DELAYS_SECONDS = [5, 30, 5 * 60, 30 * 60, 4 * 3600];
const MAX_ATTEMPTS = 10;
const BATCH_SIZE = 100;

/**
 * Scheduling externalisé : le ConformiteModule (T072) appelle
 * `drain()` toutes les 5 s via un BullMQ repeatable job (ou
 * `@nestjs/schedule` quand il sera ajouté à la stack). Cette classe
 * reste pure : entrée = ports + clock implicite, sortie = mutations
 * dans la table outbox.
 */
@Injectable()
export class OutboxPublisherJob {
  private readonly logger = new Logger(OutboxPublisherJob.name);
  private running = false;

  constructor(
    @Inject(CONFORMITE_EVENT_PUBLISHER)
    private readonly publisher: ConformiteEventPublisher,
  ) {}

  /** Drain une fenêtre. Réentrant safe : skip si déjà en cours. */
  async drain(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.processBatch();
    } catch (error) {
      this.logger.error(
        `OutboxPublisher batch failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      this.running = false;
    }
  }

  private async processBatch(): Promise<void> {
    const now = new Date();
    const rows = await prisma.outboxEntry.findMany({
      where: {
        publishedAt: null,
        OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
        attempts: { lt: MAX_ATTEMPTS },
      },
      orderBy: { createdAt: 'asc' },
      take: BATCH_SIZE,
    });

    if (rows.length === 0) return;
    this.logger.debug(`OutboxPublisher draining ${rows.length} entries`);

    for (const row of rows) {
      await this.processOne(row.id, row.eventType, row.payload, row.attempts);
    }
  }

  private async processOne(
    id: string,
    eventType: string,
    payload: unknown,
    currentAttempts: number,
  ): Promise<void> {
    try {
      const event = this.buildEvent(eventType, payload);
      await this.publisher.publish(event);
      await prisma.outboxEntry.update({
        where: { id },
        data: { publishedAt: new Date(), lastError: null },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const nextAttempts = currentAttempts + 1;
      const backoffSec =
        BACKOFF_DELAYS_SECONDS[Math.min(currentAttempts, BACKOFF_DELAYS_SECONDS.length - 1)] ??
        BACKOFF_DELAYS_SECONDS[BACKOFF_DELAYS_SECONDS.length - 1] ??
        3600;
      await prisma.outboxEntry.update({
        where: { id },
        data: {
          attempts: nextAttempts,
          nextAttemptAt: new Date(Date.now() + backoffSec * 1000),
          lastError: message,
        },
      });
      if (nextAttempts >= MAX_ATTEMPTS) {
        this.logger.error(
          `OutboxEntry ${id} reached MAX_ATTEMPTS=${MAX_ATTEMPTS} — dead-letter. Last error: ${message}`,
        );
      } else {
        this.logger.warn(
          `OutboxEntry ${id} failed (attempt ${nextAttempts}), retry in ${backoffSec}s: ${message}`,
        );
      }
    }
  }

  /**
   * Reconstruit l'événement typé à partir de la row. Le type attendu
   * est déduit de eventType. Les use cases ont stocké le payload en
   * JSON sérialisé → on lit tel quel et l'on cast vers le type union.
   */
  private buildEvent(eventType: string, payload: unknown): ConformiteDomainEvent {
    return { type: eventType, ...(payload as object) } as ConformiteDomainEvent;
  }
}
