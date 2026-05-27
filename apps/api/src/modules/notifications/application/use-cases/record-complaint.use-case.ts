// T091 — RecordComplaintUseCase — GREEN T088.
// Toute plainte → suppression permanente (ISP feedback loop).

import { Inject, Injectable, Optional } from '@nestjs/common';
import { emailComplainedCounter } from '../../infrastructure/notifications-metrics';
import {
  NOTIFICATION_AUDIT_LOG_WRITER,
  type NotificationAuditLogWriter,
} from '../ports/notification-audit-log-writer.port';
import {
  NOTIFICATION_LOG_READER,
  type NotificationLogReader,
} from '../ports/notification-log-reader.port';
import {
  NOTIFICATION_LOG_WRITER,
  type NotificationLogWriter,
} from '../ports/notification-log-writer.port';
import {
  SUPPRESSION_LIST_WRITER,
  type SuppressionListWriter,
} from '../ports/suppression-list-writer.port';

export interface RecordComplaintInput {
  readonly sesMessageId: string;
  readonly occurredAt: Date;
  readonly recipientEmail: string;
  readonly recipientEmailHash: string;
  readonly complaintFeedbackType: string | null;
  readonly userAgent: string | null;
  readonly feedbackId: string;
}

@Injectable()
export class RecordComplaintUseCase {
  constructor(
    @Inject(NOTIFICATION_LOG_WRITER) private readonly logWriter: NotificationLogWriter,
    @Inject(SUPPRESSION_LIST_WRITER) private readonly suppressionWriter: SuppressionListWriter,
    @Inject(NOTIFICATION_AUDIT_LOG_WRITER) private readonly auditWriter: NotificationAuditLogWriter,
    @Optional() @Inject(NOTIFICATION_LOG_READER) private readonly logReader?: NotificationLogReader,
  ) {}

  async execute(input: RecordComplaintInput): Promise<void> {
    if (this.logReader) {
      const logEntry = await this.logReader.findBySesMessageId(input.sesMessageId);
      if (logEntry) {
        await this.logWriter.updateStatus({
          correlationId: logEntry.correlationId,
          status: 'complained',
          timestamp: input.occurredAt,
          sesMessageId: input.sesMessageId,
        });
      }
    }

    await this.suppressionWriter.upsert({
      recipientEmailHashHMAC: input.recipientEmailHash,
      reason: 'complaint',
      source: 'ses_sns_complaint',
      expiresAt: null,
      details: {
        sesMessageId: input.sesMessageId,
        complaintFeedbackType: input.complaintFeedbackType,
        userAgent: input.userAgent,
        feedbackId: input.feedbackId,
      },
    });

    await this.auditWriter.append({
      eventType: 'notification.complaint_suppressed',
      actorId: 'system',
      actorRole: 'system',
      metadata: {
        sesMessageId: input.sesMessageId,
        recipientEmailHash: input.recipientEmailHash,
        complaintFeedbackType: input.complaintFeedbackType,
      },
    });
    emailComplainedCounter.add(1);
  }
}

export const RECORD_COMPLAINT_USE_CASE = Symbol.for('NotificationsRecordComplaintUseCase');
