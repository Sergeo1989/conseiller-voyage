// T053 — NotificationDispatchWorker (BullMQ).
//
// Consomme la file `notifications-dispatch`. Pour chaque job :
//   1. Render du template via EmailTemplateRenderer.
//   2. Envoi SES via EmailSender.
//   3. Mise à jour du log (sent | failed | dead_letter).
//   4. Propagation OTel span context (corrélation via correlationId).
//
// Retry exponentiel géré par BullMQ (5 attempts max, delays de T026).
// Dead-letter après MAX_ATTEMPTS : status → dead_letter, audit émis.

import { performance } from 'node:perf_hooks';
import { DEFAULT_BRAND_INFO } from '@cv/shared/brand';
import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { context, propagation, trace } from '@opentelemetry/api';
import { type Job, Worker } from 'bullmq';
import { EMAIL_SENDER, type EmailSender } from '../../application/ports/email-sender.port';
import {
  EMAIL_TEMPLATE_RENDERER,
  type EmailTemplateRenderer,
} from '../../application/ports/email-template-renderer.port';
import {
  NOTIFICATION_AUDIT_LOG_WRITER,
  type NotificationAuditLogWriter,
} from '../../application/ports/notification-audit-log-writer.port';
import {
  NOTIFICATION_LOG_WRITER,
  type NotificationLogWriter,
} from '../../application/ports/notification-log-writer.port';
import {
  computeBackoff,
  shouldMoveToDeadLetter,
} from '../../domain/pure-functions/compute-backoff';
import type { EmailLocale } from '../../domain/value-objects/email-locale.vo';
import { emailSendDurationHistogram } from '../notifications-metrics';

export const NOTIFICATIONS_DISPATCH_QUEUE = 'notifications-dispatch';
export const BULLMQ_REDIS_CONNECTION = Symbol.for('NotificationsBullMQRedisConnection');

export interface DispatchJobData {
  notificationLogEntryId: string;
  correlationId: string;
  templateId: string;
  recipientEmail: string;
  recipientLocale: string;
  templateData: Record<string, unknown>;
  priority: number;
  sourceModule: string;
  /** OTel W3C trace context carrier (T103). */
  traceContext?: Record<string, string>;
}

@Injectable()
export class NotificationDispatchWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationDispatchWorker.name);
  private worker: Worker | null = null;

  constructor(
    @Inject(EMAIL_SENDER) private readonly emailSender: EmailSender,
    @Inject(EMAIL_TEMPLATE_RENDERER) private readonly renderer: EmailTemplateRenderer,
    @Inject(NOTIFICATION_LOG_WRITER) private readonly logWriter: NotificationLogWriter,
    @Inject(NOTIFICATION_AUDIT_LOG_WRITER) private readonly auditWriter: NotificationAuditLogWriter,
    @Inject(BULLMQ_REDIS_CONNECTION)
    private readonly redisConnection: { host: string; port: number },
  ) {}

  onModuleInit(): void {
    this.worker = new Worker<DispatchJobData>(
      NOTIFICATIONS_DISPATCH_QUEUE,
      async (job) => this.process(job),
      {
        connection: this.redisConnection,
        concurrency: 5,
        removeOnComplete: { age: 24 * 3600, count: 1000 },
        removeOnFail: { age: 30 * 24 * 3600 },
      },
    );
    this.worker.on('failed', (job, err) => {
      this.logger.error(`Job ${job?.id} failed: ${err.message}`);
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
  }

  private async process(job: Job<DispatchJobData>): Promise<void> {
    // T103 — Restore OTel span context propagated from the enqueue site.
    const parentCtx = propagation.extract(context.active(), job.data.traceContext ?? {});
    return context.with(parentCtx, () => this.processInContext(job));
  }

  private async processInContext(job: Job<DispatchJobData>): Promise<void> {
    const tracer = trace.getTracer('cv.notifications');
    return tracer.startActiveSpan('notification.dispatch', async (span) => {
      try {
        await this.processJob(job);
      } finally {
        span.end();
      }
    });
  }

  private async processJob(job: Job<DispatchJobData>): Promise<void> {
    const data = job.data;
    const now = new Date();
    const attemptsSoFar = job.attemptsMade + 1;

    let rendered: Awaited<ReturnType<EmailTemplateRenderer['render']>>;
    try {
      rendered = await this.renderer.render({
        templateId: data.templateId,
        locale: data.recipientLocale as EmailLocale,
        data: data.templateData,
      });
    } catch (cause) {
      await this.logWriter.updateStatus({
        correlationId: data.correlationId,
        status: 'rendering_failed',
        timestamp: now,
        lastError: String(cause),
      });
      return;
    }

    if (shouldMoveToDeadLetter(attemptsSoFar)) {
      await this.logWriter.updateStatus({
        correlationId: data.correlationId,
        status: 'dead_letter',
        timestamp: now,
      });
      await this.auditWriter.append({
        eventType: 'notification.dead_lettered',
        actorId: 'system',
        actorRole: 'system',
        metadata: { correlationId: data.correlationId, attempts: attemptsSoFar },
      });
      return;
    }

    try {
      const brand = DEFAULT_BRAND_INFO;
      const sendStart = performance.now();
      const result = await this.emailSender.send({
        correlationId: data.correlationId,
        fromEmail: brand.fromEmail,
        fromName: brand.fromName,
        recipientEmail: data.recipientEmail,
        subject: rendered.subject,
        htmlBody: rendered.htmlBody,
        textBody: rendered.textBody,
        headers: [],
        labels: {
          templateId: data.templateId,
          locale: data.recipientLocale,
          sourceModule: data.sourceModule,
        },
      });
      emailSendDurationHistogram.record((performance.now() - sendStart) / 1000, {
        template_id: data.templateId,
      });
      await this.logWriter.updateStatus({
        correlationId: data.correlationId,
        status: 'sent',
        timestamp: new Date(),
        sesMessageId: result.sesMessageId,
        lastError: null,
      });
      await this.auditWriter.append({
        eventType: 'notification.dispatched',
        actorId: 'system',
        actorRole: 'system',
        metadata: { correlationId: data.correlationId, sesMessageId: result.sesMessageId },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const nextAttemptAt = computeBackoff(attemptsSoFar, new Date());
      await this.logWriter.updateStatus({
        correlationId: data.correlationId,
        status: 'failed',
        timestamp: now,
        lastError: message,
        nextAttemptAt,
        attempts: attemptsSoFar,
      });
      throw err;
    }
  }
}
