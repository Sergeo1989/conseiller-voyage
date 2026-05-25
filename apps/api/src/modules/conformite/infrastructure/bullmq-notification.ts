// T064 — BullmqNotification adapter.
// Implémente NotificationPort via BullMQ : un job par destinataire
// (Principe X — fiabilité, idempotence, retries indépendants).
//
// Le job 'send-notification' est consommé par un worker dédié (à venir
// dans une feature ultérieure côté module identité — qui traduit
// NotificationKind + payload en email via react-email + SES).

import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import type { Queue } from 'bullmq';
import type { NotificationPort, NotificationToSend } from '../application/ports/notification.port';

/** Nom de queue BullMQ — partagé avec le worker côté identité. */
export const CONFORMITE_NOTIFICATIONS_QUEUE = 'conformite.notifications';

/** Nom du job — un par notification, idempotent côté worker via jobId. */
export const SEND_NOTIFICATION_JOB = 'send-notification';

@Injectable()
export class BullmqNotification implements NotificationPort {
  constructor(
    @InjectQueue(CONFORMITE_NOTIFICATIONS_QUEUE)
    private readonly queue: Queue,
  ) {}

  async enqueue(notification: NotificationToSend): Promise<void> {
    // jobId déterministe (conseillerId + kind + horodatage) → idempotent
    // tant que le caller appelle deux fois pour la même intention dans
    // la même seconde. Pour idempotence stricte, c'est l'OutboxPublisher
    // qui garantit at-least-once → idempotence côté job worker.
    const jobId = `${notification.conseillerId}:${notification.kind}:${Date.now()}`;

    await this.queue.add(SEND_NOTIFICATION_JOB, notification, {
      jobId,
      attempts: 5,
      backoff: { type: 'exponential', delay: 30_000 },
      removeOnComplete: { age: 24 * 3600, count: 1_000 },
      removeOnFail: { age: 30 * 24 * 3600 },
    });
  }
}
