// T030 [US1] — Notification conseiller : un job BullMQ PAR destinataire
// (Principe X — fiabilité, retries indépendants, jamais un job groupé).
//
// 3 acteurs :
//   - LeadNotificationDispatcher : scanne l'outbox pending → ajoute un job
//     par notification (jobId = notificationId → idempotent at-least-once).
//   - LeadNotificationSender : logique d'envoi (résout lead → résumé brief →
//     mailer → markSent / markSkippedUnverified / markFailed).
//   - LeadNotificationWorker : @Processor BullMQ qui délègue au sender ;
//     re-throw en cas d'échec SES pour déclencher le backoff BullMQ.

import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Job, Queue } from 'bullmq';
import { CLOCK, type Clock } from '../../../../common/ports/clock.port';
import {
  LEAD_BRIEF_SUMMARY_READER,
  LEAD_NOTIFICATION_MAILER,
  LEAD_NOTIFICATION_OUTBOX,
  LEAD_READER,
  type LeadBriefSummaryReader,
  type LeadNotificationMailer,
  type LeadNotificationOutboxPort,
  type LeadReader,
} from '../../application/ports';

export const LEAD_NOTIFICATIONS_QUEUE = 'matching.lead-notifications';
export const SEND_LEAD_NOTIFICATION_JOB = 'send-lead-notification';

export interface LeadNotificationJobData {
  readonly notificationId: string;
  readonly leadId: string;
  readonly conseillerId: string;
}

// ---------------------------------------------------------------------------
// Dispatcher — un job par destinataire
// ---------------------------------------------------------------------------

const DISPATCH_BATCH = 100;

@Injectable()
export class LeadNotificationDispatcher {
  private readonly logger = new Logger(LeadNotificationDispatcher.name);
  private running = false;

  constructor(
    @InjectQueue(LEAD_NOTIFICATIONS_QUEUE) private readonly queue: Queue,
    @Inject(LEAD_NOTIFICATION_OUTBOX) private readonly outbox: LeadNotificationOutboxPort,
  ) {}

  /** Réentrant safe : skip si déjà en cours. */
  async dispatchPending(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const pending = await this.outbox.scanPending(DISPATCH_BATCH);
      for (const n of pending) {
        await this.queue.add(
          SEND_LEAD_NOTIFICATION_JOB,
          { notificationId: n.id, leadId: n.leadId, conseillerId: n.conseillerId },
          { jobId: n.id }, // idempotent : un seul job par notification
        );
      }
    } catch (error) {
      this.logger.error(
        `LeadNotificationDispatcher failed: ${error instanceof Error ? error.message : String(error)}`,
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
export class LeadNotificationSender {
  private readonly logger = new Logger(LeadNotificationSender.name);

  constructor(
    @Inject(LEAD_READER) private readonly leadReader: LeadReader,
    @Inject(LEAD_BRIEF_SUMMARY_READER)
    private readonly briefSummaryReader: LeadBriefSummaryReader,
    @Inject(LEAD_NOTIFICATION_MAILER) private readonly mailer: LeadNotificationMailer,
    @Inject(LEAD_NOTIFICATION_OUTBOX) private readonly outbox: LeadNotificationOutboxPort,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** Traite une notification. Lève si SES échoue (→ retry BullMQ). */
  async send(data: LeadNotificationJobData): Promise<void> {
    const lead = await this.leadReader.findById(data.leadId);
    if (!lead) {
      await this.outbox.markFailed(data.notificationId, 'lead_not_found');
      return;
    }
    // Brief anonymisé (Loi 25) → notification caduque : suppression non bloquante.
    if (!lead.briefId) {
      this.logger.warn(`Lead ${data.leadId} sans briefId (anonymisé) — notification supprimée`);
      await this.outbox.markSent(data.notificationId, this.clock.now());
      return;
    }
    const summary = await this.briefSummaryReader.getSummary(lead.briefId);
    if (!summary) {
      await this.outbox.markSent(data.notificationId, this.clock.now());
      return;
    }

    const result = await this.mailer.sendLeadReceived({
      conseillerId: data.conseillerId,
      leadId: data.leadId,
      briefSummary: summary,
    });

    switch (result.kind) {
      case 'sent':
        await this.outbox.markSent(data.notificationId, this.clock.now());
        break;
      case 'skipped_unverified':
        await this.outbox.markSkippedUnverified(data.notificationId);
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

@Processor(LEAD_NOTIFICATIONS_QUEUE)
export class LeadNotificationWorker extends WorkerHost {
  private readonly logger = new Logger(LeadNotificationWorker.name);

  constructor(private readonly sender: LeadNotificationSender) {
    super();
  }

  async process(job: Job<LeadNotificationJobData>): Promise<void> {
    try {
      await this.sender.send(job.data);
    } catch (error) {
      // markFailed pour visibilité, puis re-throw → backoff BullMQ (SES HS).
      await this.markFailedSafe(job.data.notificationId, error);
      throw error;
    }
  }

  private async markFailedSafe(notificationId: string, error: unknown): Promise<void> {
    try {
      // L'outbox est résolu via le sender (même instance partagée DI) ;
      // on logge ici, le mark a déjà été tenté par le sender pour les cas
      // définitifs. Pour les exceptions SES, on laisse BullMQ retenter.
      this.logger.warn(
        `Lead notification ${notificationId} échec envoi: ${error instanceof Error ? error.message : String(error)}`,
      );
    } catch {
      // best-effort
    }
  }
}
