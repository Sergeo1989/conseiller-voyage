// T047 — SendNotificationUseCase.
//
// Règles contractuelles (contracts/notification.port.md) :
//   1. Valider l'envelope (Zod) → NotificationEnvelopeValidationError si invalide.
//   2. Canonicaliser l'email + hash HMAC + vérifier suppression list.
//   3. Insérer dans notification_email_log avec idempotence (correlationId unique).
//   4. Enqueue BullMQ avec priority via priorityForEventType.
//
// Garantie : si send() lève, aucune ligne créée (P2002 propagé ou validation).

import { randomUUID } from 'node:crypto';
import {
  type NotificationEnvelope,
  NotificationEnvelopeSchema,
  NotificationEnvelopeValidationError,
} from '@cv/shared/notifications';
import { Inject, Injectable } from '@nestjs/common';
import { context, propagation } from '@opentelemetry/api';
import { canonicalizeEmail } from '../../domain/pure-functions/canonicalize-email';
import { hashRecipientEmail } from '../../domain/pure-functions/hash-recipient-email';
import { priorityForEventType } from '../../domain/pure-functions/priority-for-event-type';
import { shouldSuppress } from '../../domain/pure-functions/should-suppress';
import type { SendResult } from '../../interface/public-api/notification.port';
import {
  NOTIFICATION_AUDIT_LOG_WRITER,
  type NotificationAuditLogWriter,
} from '../ports/notification-audit-log-writer.port';
import {
  NOTIFICATION_LOG_WRITER,
  type NotificationLogWriter,
} from '../ports/notification-log-writer.port';
import {
  SUPPRESSION_LIST_READER,
  type SuppressionListReader,
} from '../ports/suppression-list-reader.port';

export type EnqueueFn = (jobData: {
  notificationLogEntryId: string;
  correlationId: string;
  templateId: string;
  recipientEmail: string;
  recipientLocale: string;
  templateData: Record<string, unknown>;
  priority: number;
  sourceModule: string;
  traceContext?: Record<string, string>;
}) => Promise<void>;

export interface PepperConfig {
  readonly pepper: string;
  readonly historicalPeppers: readonly string[];
}

export const NOTIFICATION_ENQUEUE_FN = Symbol.for('NotificationsEnqueueFn');
export const NOTIFICATION_PEPPER_CONFIG = Symbol.for('NotificationsPepperConfig');

@Injectable()
export class SendNotificationUseCase {
  constructor(
    @Inject(NOTIFICATION_LOG_WRITER)
    private readonly logWriter: NotificationLogWriter,
    @Inject(SUPPRESSION_LIST_READER)
    private readonly suppressionReader: SuppressionListReader,
    @Inject(NOTIFICATION_AUDIT_LOG_WRITER)
    private readonly auditWriter: NotificationAuditLogWriter,
    @Inject(NOTIFICATION_ENQUEUE_FN)
    private readonly enqueue: EnqueueFn,
    @Inject(NOTIFICATION_PEPPER_CONFIG)
    private readonly pepperConfig: PepperConfig,
  ) {}

  async execute(envelope: NotificationEnvelope): Promise<SendResult> {
    const parsed = NotificationEnvelopeSchema.safeParse(envelope);
    if (!parsed.success) {
      throw new NotificationEnvelopeValidationError(parsed.error.issues);
    }
    const env = parsed.data;

    const canonical = canonicalizeEmail(env.recipientEmail);
    const hash = hashRecipientEmail(canonical, this.pepperConfig.pepper);

    const suppressionEntry = await this.suppressionReader.findByEmailHash(hash);
    const decision = shouldSuppress(
      suppressionEntry
        ? {
            recipientEmailHashHMAC: suppressionEntry.recipientEmailHashHMAC,
            reason: suppressionEntry.reason,
            addedAt: suppressionEntry.addedAt,
            expiresAt: suppressionEntry.expiresAt,
            removedAt: suppressionEntry.removedAt,
          }
        : null,
      new Date(),
    );

    if (decision.suppress) {
      await this.auditWriter.append({
        eventType: 'notification.skipped_suppressed',
        actorId: 'system',
        actorRole: 'system',
        targetEmailHashHMAC: hash,
        metadata: { correlationId: env.correlationId, suppressionReason: decision.reason },
      });
      return { accepted: false, reason: 'suppressed', suppressionReason: decision.reason };
    }

    const logEntryId = randomUUID();
    const { id, created } = await this.logWriter.insert({
      id: logEntryId,
      correlationId: env.correlationId,
      sourceModule: env.sourceModule,
      eventType: env.eventType,
      templateId: env.templateId,
      recipientEmailClear: env.recipientEmail,
      recipientEmailCanonical: canonical,
      recipientEmailHashHMAC: hash,
      recipientLocale: env.recipientLocale,
      enqueuedAt: new Date(env.enqueuedAt),
      status: 'queued',
      templateData: env.templateData as Record<string, unknown>,
    });

    if (!created) {
      return { accepted: false, reason: 'duplicate', notificationLogEntryId: id };
    }

    const priority = priorityForEventType(env.eventType);
    const traceContext: Record<string, string> = {};
    propagation.inject(context.active(), traceContext);
    await this.enqueue({
      notificationLogEntryId: id,
      correlationId: env.correlationId,
      templateId: env.templateId,
      recipientEmail: env.recipientEmail,
      recipientLocale: env.recipientLocale,
      templateData: env.templateData,
      priority,
      sourceModule: env.sourceModule,
      traceContext,
    });

    return { accepted: true, notificationLogEntryId: id };
  }
}
