// T041 — Port NotificationLogReader (ISP).

import type { NotificationLogEntry } from '../../domain/entities/notification-log-entry.entity';
import type { NotificationStatus } from '../../domain/enums/notification-status.enum';

export interface NotificationLogReader {
  findById(id: string): Promise<NotificationLogEntry | null>;
  findByCorrelationId(correlationId: string): Promise<NotificationLogEntry | null>;
  findBySesMessageId(sesMessageId: string): Promise<NotificationLogEntry | null>;
  /** DLQ list pour la console admin. */
  listDeadLetter(filters: {
    sourceModule?: 'conformite' | 'identite' | 'intake' | 'matching' | 'facturation';
    page: number;
    pageSize: number;
  }): Promise<{
    items: ReadonlyArray<NotificationLogEntry>;
    totalCount: number;
  }>;
  /** Snapshot des métriques 24h pour la console admin. */
  metricsSnapshot(windowHours: number): Promise<{
    sent: number;
    delivered: number;
    bounced: { total: number; hard: number; soft: number };
    complained: number;
    failed: number;
    deadLetter: number;
    topTemplatesByBounceRate: ReadonlyArray<{
      templateId: string;
      bounces: number;
      sent: number;
      rate: number;
    }>;
  }>;
  countByStatus(status: NotificationStatus): Promise<number>;
  /** Count 'bounced' entries for a given email hash within a time window (for soft bounce threshold). */
  countRecentBounces(recipientEmailHashHMAC: string, since: Date): Promise<number>;
}

export const NOTIFICATION_LOG_READER = Symbol.for('NotificationsLogReader');
