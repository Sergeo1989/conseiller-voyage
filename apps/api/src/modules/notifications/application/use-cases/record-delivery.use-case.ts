// T092 — RecordDeliveryUseCase — GREEN T089.
// Met à jour le status → 'delivered' pour le log entry correspondant.

import { Inject, Injectable } from '@nestjs/common';
import { emailDeliveredCounter } from '../../infrastructure/notifications-metrics';
import {
  NOTIFICATION_LOG_READER,
  type NotificationLogReader,
} from '../ports/notification-log-reader.port';
import {
  NOTIFICATION_LOG_WRITER,
  type NotificationLogWriter,
} from '../ports/notification-log-writer.port';

export interface RecordDeliveryInput {
  readonly sesMessageId: string;
  readonly occurredAt: Date;
  readonly recipientEmail: string;
  readonly smtpResponse: string;
  readonly processingTimeMillis: number;
}

@Injectable()
export class RecordDeliveryUseCase {
  constructor(
    @Inject(NOTIFICATION_LOG_READER) private readonly logReader: NotificationLogReader,
    @Inject(NOTIFICATION_LOG_WRITER) private readonly logWriter: NotificationLogWriter,
  ) {}

  async execute(input: RecordDeliveryInput): Promise<void> {
    const entry = await this.logReader.findBySesMessageId(input.sesMessageId);
    if (!entry) return;

    await this.logWriter.updateStatus({
      correlationId: entry.correlationId,
      status: 'delivered',
      timestamp: input.occurredAt,
      sesMessageId: input.sesMessageId,
    });
    emailDeliveredCounter.add(1);
  }
}

export const RECORD_DELIVERY_USE_CASE = Symbol.for('NotificationsRecordDeliveryUseCase');
