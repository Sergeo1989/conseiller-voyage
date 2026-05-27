// T122 — RetryDeadLetterUseCase — GREEN T120.
// Relance manuelle d'une entry dead_letter.
// Exige un motif ≥ 10 chars (FR-029).

import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { priorityForEventType } from '../../domain/pure-functions/priority-for-event-type';
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
import { type EnqueueFn, NOTIFICATION_ENQUEUE_FN } from './send-notification.use-case';

export interface RetryDeadLetterInput {
  readonly id: string;
  readonly actorId: string;
  readonly reason: string;
}

export interface RetryDeadLetterOutput {
  readonly retried: true;
}

@Injectable()
export class RetryDeadLetterUseCase {
  constructor(
    @Inject(NOTIFICATION_LOG_READER) private readonly logReader: NotificationLogReader,
    @Inject(NOTIFICATION_LOG_WRITER) private readonly logWriter: NotificationLogWriter,
    @Inject(NOTIFICATION_AUDIT_LOG_WRITER) private readonly auditWriter: NotificationAuditLogWriter,
    @Inject(NOTIFICATION_ENQUEUE_FN) private readonly enqueue: EnqueueFn,
  ) {}

  async execute(input: RetryDeadLetterInput): Promise<RetryDeadLetterOutput> {
    if (input.reason.trim().length < 10) {
      throw new Error('reason must be at least 10 characters (FR-029)');
    }

    const entry = await this.logReader.findById(input.id);
    if (!entry) {
      throw new NotFoundException(`Notification log entry not found: ${input.id}`);
    }
    if (entry.status !== 'dead_letter') {
      throw new ConflictException(`Entry is not in dead_letter status (current: ${entry.status})`);
    }

    const now = new Date();
    await this.logWriter.updateStatus({
      correlationId: entry.correlationId,
      status: 'queued',
      timestamp: now,
      lastError: null,
      attempts: 0,
      nextAttemptAt: null,
    });

    await this.enqueue({
      notificationLogEntryId: entry.id,
      correlationId: entry.correlationId,
      templateId: entry.templateId,
      recipientEmail: entry.recipientEmailClear ?? '',
      recipientLocale: entry.recipientLocale,
      templateData: (entry.templateData as Record<string, unknown>) ?? {},
      priority: priorityForEventType(entry.eventType),
      sourceModule: entry.sourceModule,
    });

    await this.auditWriter.append({
      eventType: 'notification.dead_letter.retried_manual',
      actorId: input.actorId,
      actorRole: 'admin',
      reason: input.reason,
      metadata: { logEntryId: input.id, correlationId: entry.correlationId },
    });

    return { retried: true };
  }
}

export const RETRY_DEAD_LETTER_USE_CASE = Symbol.for('NotificationsRetryDeadLetterUseCase');
