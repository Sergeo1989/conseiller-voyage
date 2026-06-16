// T017 [017] — Notification voyageur : un job BullMQ PAR notification
// (Principe X — retries indépendants, jamais un job groupé). Mirroir 012.
//
// 3 acteurs :
//   - VoyageurNotificationDispatcher : scanne l'outbox `en_attente` → un job
//     par notification (jobId = notification.id → idempotent at-least-once).
//   - VoyageurNotificationSender : logique d'envoi (mailer → markSent / markFailed).
//   - VoyageurNotificationWorker : @Processor BullMQ ; re-throw sur échec SES
//     pour déclencher le backoff.

import type { MatchOutcome, VoyageurNotificationType } from '@cv/shared/intake';
import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Job, Queue } from 'bullmq';
import { CLOCK, type Clock } from '../../../../common/ports/clock.port';
import {
  VOYAGEUR_NOTIFICATION_MAILER,
  VOYAGEUR_NOTIFICATION_OUTBOX,
  type VoyageurNotificationMailer,
  type VoyageurNotificationOutbox,
} from '../../application/ports';

export const VOYAGEUR_NOTIFICATIONS_QUEUE = 'intake.voyageur-notifications';
export const SEND_VOYAGEUR_NOTIFICATION_JOB = 'send-voyageur-notification';

export interface VoyageurNotificationJobData {
  readonly notificationId: string;
  readonly briefId: string;
  readonly type: VoyageurNotificationType;
  readonly outcome: MatchOutcome | null;
  readonly conseillerIds: ReadonlyArray<string>;
}

const DISPATCH_BATCH = 100;

// ---------------------------------------------------------------------------
// Dispatcher — un job par notification
// ---------------------------------------------------------------------------

@Injectable()
export class VoyageurNotificationDispatcher {
  private readonly logger = new Logger(VoyageurNotificationDispatcher.name);
  private running = false;

  constructor(
    @InjectQueue(VOYAGEUR_NOTIFICATIONS_QUEUE) private readonly queue: Queue,
    @Inject(VOYAGEUR_NOTIFICATION_OUTBOX) private readonly outbox: VoyageurNotificationOutbox,
  ) {}

  /** Réentrant safe : skip si déjà en cours. */
  async dispatchPending(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const pending = await this.outbox.scanPending(DISPATCH_BATCH);
      for (const n of pending) {
        await this.queue.add(
          SEND_VOYAGEUR_NOTIFICATION_JOB,
          {
            notificationId: n.id,
            briefId: n.briefId,
            type: n.type,
            outcome: n.outcome,
            conseillerIds: n.conseillerIds,
          },
          { jobId: n.id }, // idempotent : un seul job par notification
        );
      }
    } catch (error) {
      this.logger.error(
        `VoyageurNotificationDispatcher failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    } finally {
      this.running = false;
    }
  }
}

// ---------------------------------------------------------------------------
// Sender — logique d'envoi (testable hors BullMQ)
// ---------------------------------------------------------------------------

@Injectable()
export class VoyageurNotificationSender {
  constructor(
    @Inject(VOYAGEUR_NOTIFICATION_MAILER) private readonly mailer: VoyageurNotificationMailer,
    @Inject(VOYAGEUR_NOTIFICATION_OUTBOX) private readonly outbox: VoyageurNotificationOutbox,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** Traite une notification. Lève si SES échoue (→ retry BullMQ). */
  async send(data: VoyageurNotificationJobData): Promise<void> {
    const result = await this.mailer.send({
      notificationId: data.notificationId,
      briefId: data.briefId,
      type: data.type,
      outcome: data.outcome,
      conseillerIds: data.conseillerIds,
    });

    switch (result.kind) {
      case 'sent':
      case 'skipped_anonymized':
        // Issue définitive non bloquante : on clôt la notification.
        await this.outbox.markSent(data.notificationId, this.clock.now());
        break;
      case 'skipped_no_address':
        await this.outbox.markFailed(data.notificationId, 'no_address');
        break;
    }
  }
}

// ---------------------------------------------------------------------------
// Worker — @Processor BullMQ
// ---------------------------------------------------------------------------

@Processor(VOYAGEUR_NOTIFICATIONS_QUEUE)
export class VoyageurNotificationWorker extends WorkerHost {
  private readonly logger = new Logger(VoyageurNotificationWorker.name);

  constructor(private readonly sender: VoyageurNotificationSender) {
    super();
  }

  async process(job: Job<VoyageurNotificationJobData>): Promise<void> {
    try {
      await this.sender.send(job.data);
    } catch (error) {
      this.logger.warn(
        `Voyageur notification ${job.data.notificationId} échec envoi: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      throw error; // → backoff BullMQ (SES HS)
    }
  }
}
