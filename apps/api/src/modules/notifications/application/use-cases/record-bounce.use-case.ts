// T090 — RecordBounceUseCase — GREEN T087.
//
// Traite un event Bounce SES (via SNS webhook) :
//   - Permanent / Undetermined → suppression permanente (hard_bounce)
//   - Transient < 3 en 30j → log uniquement, pas de suppression
//   - Transient ≥ 3 en 30j → suppression TTL 30j (soft_bounce)
//
// Idempotent : re-jouer le même sesMessageId n'a pas d'effet sur la
// suppression (upsert) ni sur l'audit si déjà présent.

import { Inject, Injectable } from '@nestjs/common';
import { emailBouncedCounter } from '../../infrastructure/notifications-metrics';
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

export interface RecordBounceInput {
  readonly sesMessageId: string;
  readonly occurredAt: Date;
  readonly recipientEmail: string;
  readonly recipientEmailHash: string;
  readonly bounceType: 'Permanent' | 'Transient' | 'Undetermined';
  readonly bounceSubType: string;
  readonly diagnosticCode: string | null;
  readonly feedbackId: string;
}

const SOFT_BOUNCE_THRESHOLD = 3;
const SOFT_BOUNCE_WINDOW_DAYS = 30;
const SOFT_BOUNCE_TTL_DAYS = 30;

@Injectable()
export class RecordBounceUseCase {
  constructor(
    @Inject(NOTIFICATION_LOG_WRITER) private readonly logWriter: NotificationLogWriter,
    @Inject(NOTIFICATION_LOG_READER) private readonly logReader: NotificationLogReader,
    @Inject(SUPPRESSION_LIST_WRITER) private readonly suppressionWriter: SuppressionListWriter,
    @Inject(NOTIFICATION_AUDIT_LOG_WRITER) private readonly auditWriter: NotificationAuditLogWriter,
  ) {}

  async execute(input: RecordBounceInput): Promise<void> {
    const isPermanent = input.bounceType === 'Permanent' || input.bounceType === 'Undetermined';

    const logEntry = await this.logReader.findBySesMessageId(input.sesMessageId);
    if (logEntry) {
      await this.logWriter.updateStatus({
        correlationId: logEntry.correlationId,
        status: 'bounced',
        timestamp: input.occurredAt,
        sesMessageId: input.sesMessageId,
      });
    }

    if (isPermanent) {
      await this.suppressionWriter.upsert({
        recipientEmailHashHMAC: input.recipientEmailHash,
        reason: 'hard_bounce',
        source: 'ses_sns_bounce',
        expiresAt: null,
        details: {
          sesMessageId: input.sesMessageId,
          bounceType: input.bounceType,
          bounceSubType: input.bounceSubType,
          diagnosticCode: input.diagnosticCode,
          feedbackId: input.feedbackId,
        },
      });

      await this.auditWriter.append({
        eventType: 'notification.hard_bounce_suppressed',
        actorId: 'system',
        actorRole: 'system',
        metadata: {
          sesMessageId: input.sesMessageId,
          recipientEmailHash: input.recipientEmailHash,
          bounceType: input.bounceType,
        },
      });
      emailBouncedCounter.add(1, { bounce_type: input.bounceType.toLowerCase() });
    } else {
      const since = new Date(
        input.occurredAt.getTime() - SOFT_BOUNCE_WINDOW_DAYS * 24 * 3600 * 1000,
      );
      const recentBounces = await this.logReader.countRecentBounces(
        input.recipientEmailHash,
        since,
      );

      if (recentBounces >= SOFT_BOUNCE_THRESHOLD) {
        const expiresAt = new Date(
          input.occurredAt.getTime() + SOFT_BOUNCE_TTL_DAYS * 24 * 3600 * 1000,
        );
        await this.suppressionWriter.upsert({
          recipientEmailHashHMAC: input.recipientEmailHash,
          reason: 'soft_bounce_repeated',
          source: 'ses_sns_bounce',
          expiresAt,
          details: {
            sesMessageId: input.sesMessageId,
            bounceSubType: input.bounceSubType,
            recentBounceCount: recentBounces,
          },
        });

        await this.auditWriter.append({
          eventType: 'notification.soft_bounce_suppressed',
          actorId: 'system',
          actorRole: 'system',
          metadata: {
            sesMessageId: input.sesMessageId,
            recipientEmailHash: input.recipientEmailHash,
            recentBounceCount: recentBounces,
          },
        });
      }
      emailBouncedCounter.add(1, { bounce_type: 'transient' });
    }
  }
}

export const RECORD_BOUNCE_USE_CASE = Symbol.for('NotificationsRecordBounceUseCase');
