// T017 [US1] (feature 013) — Notification de conversation : un job BullMQ PAR
// destinataire (Principe X — fiabilité, retries indépendants, jamais groupé).
//
// 3 acteurs (même pattern que lead-notification.job.ts) :
//   - ConversationNotificationDispatcher : scanne l'outbox `pending` → un job
//     par notification (jobId = notificationId → idempotent at-least-once).
//   - ConversationNotificationSender : envoie via le mailer → markSent / markFailed.
//   - ConversationNotificationWorker : @Processor BullMQ ; re-throw en cas
//     d'échec SES pour déclencher le backoff BullMQ.

import type { ConversationParticipant } from '@cv/shared/matching';
import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Job, Queue } from 'bullmq';
import { CLOCK, type Clock } from '../../../../common/ports/clock.port';
import {
  CONVERSATION_NOTIFICATION_MAILER,
  CONVERSATION_NOTIFICATION_OUTBOX,
  type ConversationNotificationMailer,
  type ConversationNotificationOutbox,
} from '../../application/ports';

export const CONVERSATION_NOTIFICATIONS_QUEUE = 'matching.conversation-notifications';
export const SEND_CONVERSATION_NOTIFICATION_JOB = 'send-conversation-notification';

export interface ConversationNotificationJobData {
  readonly notificationId: string;
  readonly conversationId: string;
  readonly recipient: ConversationParticipant;
}

const DISPATCH_BATCH = 100;

// ---------------------------------------------------------------------------
// Dispatcher — un job par destinataire
// ---------------------------------------------------------------------------

@Injectable()
export class ConversationNotificationDispatcher {
  private readonly logger = new Logger(ConversationNotificationDispatcher.name);
  private running = false;

  constructor(
    @InjectQueue(CONVERSATION_NOTIFICATIONS_QUEUE) private readonly queue: Queue,
    @Inject(CONVERSATION_NOTIFICATION_OUTBOX)
    private readonly outbox: ConversationNotificationOutbox,
  ) {}

  /** Réentrant safe : skip si déjà en cours. */
  async dispatchPending(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const pending = await this.outbox.scanPending(DISPATCH_BATCH);
      for (const n of pending) {
        await this.queue.add(
          SEND_CONVERSATION_NOTIFICATION_JOB,
          { notificationId: n.id, conversationId: n.conversationId, recipient: n.recipient },
          { jobId: n.id }, // idempotent : un seul job par notification
        );
      }
    } catch (error) {
      this.logger.error(
        `ConversationNotificationDispatcher failed: ${error instanceof Error ? error.message : String(error)}`,
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
export class ConversationNotificationSender {
  constructor(
    @Inject(CONVERSATION_NOTIFICATION_MAILER)
    private readonly mailer: ConversationNotificationMailer,
    @Inject(CONVERSATION_NOTIFICATION_OUTBOX)
    private readonly outbox: ConversationNotificationOutbox,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** Traite une notification. Lève si SES échoue (→ retry BullMQ). */
  async send(data: ConversationNotificationJobData): Promise<void> {
    const result = await this.mailer.sendNewMessage({
      conversationId: data.conversationId,
      recipient: data.recipient,
    });
    switch (result.kind) {
      case 'sent':
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

@Processor(CONVERSATION_NOTIFICATIONS_QUEUE)
export class ConversationNotificationWorker extends WorkerHost {
  private readonly logger = new Logger(ConversationNotificationWorker.name);

  constructor(
    private readonly sender: ConversationNotificationSender,
    @Inject(CONVERSATION_NOTIFICATION_OUTBOX)
    private readonly outbox: ConversationNotificationOutbox,
  ) {
    super();
  }

  async process(job: Job<ConversationNotificationJobData>): Promise<void> {
    try {
      await this.sender.send(job.data);
    } catch (error) {
      // Visibilité : marque `failed` (attempts++), puis re-throw → backoff BullMQ.
      await this.markFailedSafe(job.data.notificationId, error);
      throw error;
    }
  }

  private async markFailedSafe(notificationId: string, error: unknown): Promise<void> {
    try {
      await this.outbox.markFailed(
        notificationId,
        error instanceof Error ? error.message : String(error),
      );
    } catch (e) {
      this.logger.warn(
        `markFailed best-effort échoué pour ${notificationId}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }
}
