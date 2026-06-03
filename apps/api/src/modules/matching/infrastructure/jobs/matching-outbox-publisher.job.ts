// T093 — MatchingOutboxPublisherJob.
// BullMQ-style worker qui draine la table `matching_outbox_entries` vers le
// bus interne (Redis pub/sub via MatchingEventPublisher), consommable par 012.
//
// Cycle :
//   1. Scan : publishedAt IS NULL, ORDER BY createdAt ASC LIMIT 100.
//   2. Pour chaque row : publie l'event (nom kebab-case mappé depuis l'enum DB).
//   3. Succès → UPDATE publishedAt = NOW().
//   4. Échec → la row reste non publiée et sera retentée au prochain cycle
//      (le schéma `matching_outbox_entries` ne porte pas de colonnes
//      attempts/backoff — un échec persistant log un WARN à chaque cycle).
//
// Garanties at-least-once : un event peut être publié plusieurs fois (crash
// entre publish et UPDATE). Les consommateurs DOIVENT être idempotents via
// `idempotencyKey` (propagé dans le message). Cf. ADR-0024 §E3 + research R7.
//
// Pattern hérité de OutboxPublisherJob (feature 001 conformité).

import { prisma } from '@cv/db';
import { toEventBusName } from '@cv/shared/matching';
import type { MatchingOutboxEventTypeEnum } from '@cv/shared/matching';
import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  MATCHING_EVENT_PUBLISHER,
  type MatchingEventPublisher,
} from '../../application/ports/matching-event-publisher.port';

const BATCH_SIZE = 100;

@Injectable()
export class MatchingOutboxPublisherJob {
  private readonly logger = new Logger(MatchingOutboxPublisherJob.name);
  private running = false;

  constructor(
    @Inject(MATCHING_EVENT_PUBLISHER)
    private readonly publisher: MatchingEventPublisher,
  ) {}

  /** Draine une fenêtre. Réentrant safe : skip si déjà en cours. */
  async drain(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.processBatch();
    } catch (error) {
      this.logger.error(
        `MatchingOutboxPublisher batch failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      this.running = false;
    }
  }

  private async processBatch(): Promise<void> {
    const rows = await prisma.matchingOutboxEntry.findMany({
      where: { publishedAt: null },
      orderBy: { createdAt: 'asc' },
      take: BATCH_SIZE,
    });
    if (rows.length === 0) return;
    this.logger.debug(`MatchingOutboxPublisher draining ${rows.length} entries`);

    for (const row of rows) {
      await this.processOne(row.id, row.eventType, row.payload, row.idempotencyKey);
    }
  }

  private async processOne(
    id: string,
    eventType: string,
    payload: unknown,
    idempotencyKey: string,
  ): Promise<void> {
    try {
      await this.publisher.publish({
        name: toEventBusName(eventType as MatchingOutboxEventTypeEnum),
        payload,
        idempotencyKey,
      });
      await prisma.matchingOutboxEntry.update({
        where: { id },
        data: { publishedAt: new Date() },
      });
    } catch (error) {
      // Row laissée non publiée → retentée au prochain cycle de drain.
      this.logger.warn(
        `MatchingOutboxEntry ${id} (${eventType}) publish failed, retry next cycle: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
