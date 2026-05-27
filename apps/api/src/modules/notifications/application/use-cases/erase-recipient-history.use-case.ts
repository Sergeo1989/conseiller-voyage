// T113 — EraseRecipientHistoryUseCase — GREEN T112.
//
// Anonymise toutes les rows notification_email_log pour un hash HMAC donné.
// Conforme Loi 25 art. 28.1 : PII (email clair, canonical, corps html/text)
// sont nullifiés. Le hash est conservé pour traçabilité audit.
// La contrainte CHECK Postgres garantit l'intégrité (cf. migrations T027).
//
// Idempotent : un second appel avec le même hash retourne rowsAnonymized=0.

import { Inject, Injectable } from '@nestjs/common';
import {
  NOTIFICATION_AUDIT_LOG_WRITER,
  type NotificationAuditLogWriter,
} from '../ports/notification-audit-log-writer.port';
import {
  NOTIFICATION_LOG_WRITER,
  type NotificationLogWriter,
} from '../ports/notification-log-writer.port';

export interface EraseRecipientHistoryInput {
  readonly recipientEmailHashHMAC: string;
  readonly reason: string;
  readonly requestedAt: Date;
}

export interface EraseRecipientHistoryOutput {
  readonly rowsAnonymized: number;
}

@Injectable()
export class EraseRecipientHistoryUseCase {
  constructor(
    @Inject(NOTIFICATION_LOG_WRITER) private readonly logWriter: NotificationLogWriter,
    @Inject(NOTIFICATION_AUDIT_LOG_WRITER) private readonly auditWriter: NotificationAuditLogWriter,
  ) {}

  async execute(input: EraseRecipientHistoryInput): Promise<EraseRecipientHistoryOutput> {
    const rowsAnonymized = await this.logWriter.anonymizeByEmailHash({
      recipientEmailHashHMAC: input.recipientEmailHashHMAC,
      now: input.requestedAt,
    });

    await this.auditWriter.append({
      eventType: 'notification.recipient_history.erased',
      actorId: 'system',
      actorRole: 'system',
      targetEmailHashHMAC: input.recipientEmailHashHMAC,
      reason: input.reason,
      metadata: { rowsAnonymized, requestedAt: input.requestedAt.toISOString() },
    });

    return { rowsAnonymized };
  }
}

export const ERASE_RECIPIENT_HISTORY_USE_CASE = Symbol.for(
  'NotificationsEraseRecipientHistoryUseCase',
);
