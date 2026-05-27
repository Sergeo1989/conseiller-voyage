// T055 — NotificationsModule.
//
// Wiring DI complet du module notifications.
// Expose uniquement NotificationPort + NOTIFICATION_PORT en exports.
// Aucun autre import depuis ce module n'est autorisé cross-module
// (cf. tools/check-module-boundaries.ts, T002).

import { BullModule, getQueueToken } from '@nestjs/bullmq';
import { Module, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { sesClient } from '../../../aws/clients';
import { SystemClock } from '../../../common/infrastructure/system-clock';
import { CLOCK } from '../../../common/ports/clock.port';
import { env } from '../../../env';
import { BullMqModule } from '../../../queue/bullmq.module';
import { RoleGuard } from '../../identite/interface/role.guard';
import { EMAIL_SENDER } from '../application/ports/email-sender.port';
import { EMAIL_TEMPLATE_RENDERER } from '../application/ports/email-template-renderer.port';
import { NOTIFICATION_AUDIT_LOG_READER } from '../application/ports/notification-audit-log-reader.port';
import { NOTIFICATION_AUDIT_LOG_WRITER } from '../application/ports/notification-audit-log-writer.port';
import { NOTIFICATION_LOG_READER } from '../application/ports/notification-log-reader.port';
import { NOTIFICATION_LOG_WRITER } from '../application/ports/notification-log-writer.port';
import { SUPPRESSION_LIST_READER } from '../application/ports/suppression-list-reader.port';
import { SUPPRESSION_LIST_WRITER } from '../application/ports/suppression-list-writer.port';
import {
  ERASE_RECIPIENT_HISTORY_USE_CASE,
  EraseRecipientHistoryUseCase,
} from '../application/use-cases/erase-recipient-history.use-case';
import { RecordBounceUseCase } from '../application/use-cases/record-bounce.use-case';
import { RecordComplaintUseCase } from '../application/use-cases/record-complaint.use-case';
import { RecordDeliveryUseCase } from '../application/use-cases/record-delivery.use-case';
import { RemoveFromSuppressionListUseCase } from '../application/use-cases/remove-from-suppression-list.use-case';
import { RetryDeadLetterUseCase } from '../application/use-cases/retry-dead-letter.use-case';
import {
  NOTIFICATION_ENQUEUE_FN,
  NOTIFICATION_PEPPER_CONFIG,
  SendNotificationUseCase,
} from '../application/use-cases/send-notification.use-case';
import { SweepExpiredSuppressionsUseCase } from '../application/use-cases/sweep-expired-suppressions.use-case';
import { SweepRetentionUseCase } from '../application/use-cases/sweep-retention.use-case';
import { buildEmailTemplateCatalogue } from '../infrastructure/email-template-catalogue';
import { DlqGaugeRefreshJob } from '../infrastructure/jobs/dlq-gauge-refresh.job';
import {
  BULLMQ_REDIS_CONNECTION,
  NOTIFICATIONS_DISPATCH_QUEUE,
  NotificationDispatchWorker,
} from '../infrastructure/jobs/notification-dispatch.worker';
import { NotificationRetentionSweepJob } from '../infrastructure/jobs/notification-retention-sweep.job';
import { SuppressionListExpirationSweepJob } from '../infrastructure/jobs/suppression-list-expiration-sweep.job';
import { PrismaNotificationAuditLog } from '../infrastructure/prisma-notification-audit-log';
// PrismaNotificationAuditLogWriter replaced by PrismaNotificationAuditLog (T124)
import { PrismaNotificationLog } from '../infrastructure/prisma-notification-log';
import { PrismaSuppressionList } from '../infrastructure/prisma-suppression-list';
import { ReactEmailRenderer } from '../infrastructure/react-email-renderer';
import {
  SES_CLIENT,
  SES_CONFIG_SET_NAME,
  SES_UNSUBSCRIBE_URL,
  SesEmailSender,
} from '../infrastructure/ses-email-sender';
import { AdminNotificationsController } from './http/admin-notifications.controller';
import { SnsWebhookController } from './http/sns-webhook.controller';
import { SNS_HMAC_SECRET, SnsWebhookGuard } from './http/sns-webhook.guard';
import { NOTIFICATION_PORT, NotificationPortImpl } from './public-api/notification.port';
import { SEND_NOTIFICATION_USE_CASE } from './public-api/send-notification-use-case.port';

@Module({
  imports: [BullMqModule, BullModule.registerQueue({ name: NOTIFICATIONS_DISPATCH_QUEUE })],
  controllers: [SnsWebhookController, AdminNotificationsController],
  providers: [
    // --- Use cases ---
    SendNotificationUseCase,
    RecordBounceUseCase,
    RecordComplaintUseCase,
    RecordDeliveryUseCase,
    EraseRecipientHistoryUseCase,
    { provide: ERASE_RECIPIENT_HISTORY_USE_CASE, useExisting: EraseRecipientHistoryUseCase },
    RemoveFromSuppressionListUseCase,
    RetryDeadLetterUseCase,

    // --- Ports → adapters (PrismaNotificationLog implements Reader + Writer) ---
    PrismaNotificationLog,
    { provide: NOTIFICATION_LOG_WRITER, useExisting: PrismaNotificationLog },
    { provide: NOTIFICATION_LOG_READER, useExisting: PrismaNotificationLog },

    // --- PrismaSuppressionList (Reader + Writer) ---
    PrismaSuppressionList,
    { provide: SUPPRESSION_LIST_READER, useExisting: PrismaSuppressionList },
    { provide: SUPPRESSION_LIST_WRITER, useExisting: PrismaSuppressionList },

    // --- Audit log (reader + writer via combined adapter) ---
    PrismaNotificationAuditLog,
    { provide: NOTIFICATION_AUDIT_LOG_WRITER, useExisting: PrismaNotificationAuditLog },
    { provide: NOTIFICATION_AUDIT_LOG_READER, useExisting: PrismaNotificationAuditLog },

    // --- Email sender ---
    { provide: SES_CLIENT, useValue: sesClient },
    { provide: SES_CONFIG_SET_NAME, useValue: env.NOTIFICATIONS_SES_CONFIG_SET },
    { provide: SES_UNSUBSCRIBE_URL, useValue: env.NOTIFICATIONS_UNSUBSCRIBE_URL },
    { provide: EMAIL_SENDER, useClass: SesEmailSender },

    // --- Template renderer ---
    {
      provide: EMAIL_TEMPLATE_RENDERER,
      useFactory: () => new ReactEmailRenderer(buildEmailTemplateCatalogue()),
    },

    // --- BullMQ enqueue function (factory pour injecter la Queue) ---
    {
      provide: NOTIFICATION_ENQUEUE_FN,
      useFactory: (queue: Queue) => async (jobData: Parameters<Queue['add']>[1]) => {
        await queue.add('dispatch', jobData, {
          priority: (jobData as { priority?: number }).priority ?? 10,
        });
      },
      inject: [getQueueToken(NOTIFICATIONS_DISPATCH_QUEUE)],
    },

    // --- Pepper config ---
    {
      provide: NOTIFICATION_PEPPER_CONFIG,
      useValue: {
        pepper: env.NOTIFICATIONS_EMAIL_HASH_PEPPER,
        historicalPeppers: [],
      },
    },

    // --- Worker BullMQ + gauge OTel ---
    {
      provide: BULLMQ_REDIS_CONNECTION,
      useFactory: () => {
        const url = new URL(env.REDIS_URL);
        return { host: url.hostname, port: Number(url.port || 6379) };
      },
    },
    NotificationDispatchWorker,
    DlqGaugeRefreshJob,

    // --- Sweep jobs (T136-T139) ---
    SweepRetentionUseCase,
    SweepExpiredSuppressionsUseCase,
    NotificationRetentionSweepJob,
    SuppressionListExpirationSweepJob,

    // --- SNS webhook guard + clock ---
    { provide: SNS_HMAC_SECRET, useValue: env.NOTIFICATIONS_SNS_HMAC_SECRET },
    { provide: CLOCK, useClass: SystemClock },
    SnsWebhookGuard,

    // --- Admin controller guards ---
    RoleGuard,

    // --- Public facade ---
    { provide: SEND_NOTIFICATION_USE_CASE, useExisting: SendNotificationUseCase },
    { provide: NOTIFICATION_PORT, useClass: NotificationPortImpl },
    NotificationPortImpl,
  ],
  exports: [
    NOTIFICATION_PORT,
    NOTIFICATION_LOG_READER,
    SUPPRESSION_LIST_READER,
    SUPPRESSION_LIST_WRITER,
  ],
})
export class NotificationsModule implements OnModuleInit, OnModuleDestroy {
  /** Cron mensuel rétention (30 jours ≈ 1 mois, j1 02:00 ca-central-1). */
  private static readonly RETENTION_SWEEP_INTERVAL_MS = 30 * 24 * 60 * 60 * 1000;
  /** Cron quotidien expiration suppression (24 h). */
  private static readonly EXPIRATION_SWEEP_INTERVAL_MS = 24 * 60 * 60 * 1000;

  private retentionSweepInterval?: NodeJS.Timeout;
  private expirationSweepInterval?: NodeJS.Timeout;

  constructor(
    private readonly retentionSweepJob: NotificationRetentionSweepJob,
    private readonly expirationSweepJob: SuppressionListExpirationSweepJob,
  ) {}

  onModuleInit(): void {
    this.retentionSweepInterval = setInterval(() => {
      this.retentionSweepJob.sweep().catch(() => undefined);
    }, NotificationsModule.RETENTION_SWEEP_INTERVAL_MS);

    this.expirationSweepInterval = setInterval(() => {
      this.expirationSweepJob.sweep().catch(() => undefined);
    }, NotificationsModule.EXPIRATION_SWEEP_INTERVAL_MS);
  }

  onModuleDestroy(): void {
    if (this.retentionSweepInterval) clearInterval(this.retentionSweepInterval);
    if (this.expirationSweepInterval) clearInterval(this.expirationSweepInterval);
  }
}
