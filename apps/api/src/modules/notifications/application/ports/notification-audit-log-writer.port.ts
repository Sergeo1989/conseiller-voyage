// T043 — Port NotificationAuditLogWriter (append-only).

export type NotificationAuditEventType =
  | 'notification.dispatched'
  | 'notification.delivered'
  | 'notification.bounced'
  | 'notification.complained'
  | 'notification.dead_lettered'
  | 'notification.suppression.added_auto'
  | 'notification.suppression.added_manual'
  | 'notification.suppression.removed_manual'
  | 'notification.suppression.expired'
  | 'notification.suppression.expired_swept'
  | 'notification.dead_letter.retried_manual'
  | 'notification.recipient_history.erased'
  | 'notification.hard_bounce_suppressed'
  | 'notification.soft_bounce_suppressed'
  | 'notification.complaint_suppressed'
  | 'notification.retention.swept'
  | 'notification.skipped_suppressed';

export interface AppendAuditInput {
  readonly eventType: NotificationAuditEventType;
  readonly actorId: string;
  readonly actorRole: 'admin' | 'system';
  readonly targetEmailHashHMAC?: string;
  readonly reason?: string;
  readonly metadata?: Record<string, unknown>;
}

export interface NotificationAuditLogWriter {
  /**
   * Insert append-only. Tente UPDATE/DELETE sur la row produirait une
   * exception Postgres (trigger T009).
   */
  append(input: AppendAuditInput): Promise<void>;
}

export const NOTIFICATION_AUDIT_LOG_WRITER = Symbol.for('NotificationsAuditLogWriter');
