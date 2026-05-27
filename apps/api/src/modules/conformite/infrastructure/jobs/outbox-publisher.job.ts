// T066 + T058 — OutboxPublisherJob.
// BullMQ worker qui draine la table conformite_outbox.
//
// Cycle :
//   1. Scan : SELECT publishedAt IS NULL AND (nextAttemptAt IS NULL
//      OR nextAttemptAt < NOW()) ORDER BY createdAt ASC LIMIT 100.
//   2. Pour chaque row :
//      a. Publie vers Redis (ConformiteEventPublisher) pour la cache
//         invalidation cross-process (conformite.status.changed etc.).
//      b. Si l'eventType mappe vers un templateId email : appelle
//         NotificationPort.send() pour l'envoi SES transactionnel.
//   3. Succès → UPDATE publishedAt = NOW().
//   4. Échec → UPDATE attempts++, nextAttemptAt = backoff exponentiel,
//      lastError = e.message. Au-delà de 10 attempts → log ERROR.
//
// Garanties at-least-once : le publisher peut être appelé plusieurs
// fois pour le même événement (réseau lent, crash entre publish et
// UPDATE). Les consommateurs DOIVENT être idempotents.
//
// T060 — Audit : les use cases conformite ne stockent pas recipientEmail
// dans le payload outbox. Cette lacune est comblée ici par un lookup
// Prisma sur auth_users (via conseillerId du payload), en infrastructure.
//
// Cf. research.md R7 (pattern outbox) + outbox-source-contract.md.

import { prisma } from '@cv/db';
import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  NOTIFICATION_PORT as NOTIFICATIONS_MODULE_PORT,
  type NotificationPort,
} from '../../../notifications/interface/public-api/notification.port';
import {
  CONFORMITE_EVENT_PUBLISHER,
  type ConformiteDomainEvent,
  type ConformiteEventPublisher,
} from '../../application/ports/conformite-event-publisher.port';
import { mapConformiteEventToTemplateId } from './conformite-template-mapper';

/** Backoff par tentative (1-indexed). Dépassé → dead-letter. */
const BACKOFF_DELAYS_SECONDS = [5, 30, 5 * 60, 30 * 60, 4 * 3600];
const MAX_ATTEMPTS = 10;
const BATCH_SIZE = 100;
const DEFAULT_LOCALE = 'fr-CA' as const;

@Injectable()
export class OutboxPublisherJob {
  private readonly logger = new Logger(OutboxPublisherJob.name);
  private running = false;

  constructor(
    @Inject(CONFORMITE_EVENT_PUBLISHER)
    private readonly publisher: ConformiteEventPublisher,
    @Inject(NOTIFICATIONS_MODULE_PORT)
    private readonly notifications: NotificationPort,
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
      await this.processOne(
        row.id,
        row.eventType,
        row.payload as Record<string, unknown>,
        row.attempts,
        row.createdAt,
      );
    }
  }

  private async processOne(
    id: string,
    eventType: string,
    payload: Record<string, unknown>,
    currentAttempts: number,
    createdAt: Date,
  ): Promise<void> {
    try {
      // 1. Publication Redis (cache invalidation cross-process)
      const event = { type: eventType, ...payload } as ConformiteDomainEvent;
      await this.publisher.publish(event);

      // 2. Envoi courriel si l'event mappe vers un template
      const templateId = mapConformiteEventToTemplateId(eventType, payload);
      if (templateId !== null) {
        await this.sendEmail(id, eventType, templateId, payload, createdAt);
      }

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
   * T058 — Résout le destinataire et envoie la NotificationEnvelope.
   *
   * T060 — Comme les use cases conformite n'incluent pas recipientEmail
   * dans le payload (ils ne connaissent que le conseillerId), on fait
   * le lookup Prisma ici (infra layer, Prisma est déjà importé).
   */
  private async sendEmail(
    correlationId: string,
    eventType: string,
    templateId: string,
    payload: Record<string, unknown>,
    enqueuedAt: Date,
  ): Promise<void> {
    const conseillerId = payload.conseillerId as string | undefined;
    if (!conseillerId) {
      this.logger.warn(
        `OutboxEntry ${correlationId} (${eventType}) missing conseillerId — skipping email`,
      );
      return;
    }

    const user = await prisma.authUser.findUnique({
      where: { id: conseillerId },
      select: { email: true, preferredLocale: true },
    });

    if (!user?.email) {
      this.logger.warn(
        `User ${conseillerId} not found or no email — skipping email for outbox ${correlationId}`,
      );
      return;
    }

    const recipientLocale = (user.preferredLocale === 'en' ? 'en' : DEFAULT_LOCALE) as
      | 'fr-CA'
      | 'en';

    const result = await this.notifications.send({
      schemaVersion: 1,
      correlationId,
      eventType,
      templateId,
      recipientEmail: user.email,
      recipientLocale,
      templateData: payload,
      sourceModule: 'conformite',
      enqueuedAt: enqueuedAt.toISOString(),
    });

    if (result.accepted) {
      this.logger.debug(`Notification enqueued for ${correlationId} → ${templateId}`);
    } else if (result.reason === 'duplicate') {
      this.logger.debug(`Notification duplicate (already sent) for ${correlationId}`);
    } else {
      this.logger.warn(`Notification not sent for ${correlationId}: ${result.reason}`);
    }
  }
}
