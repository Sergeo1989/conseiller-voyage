// T123 — Port NotificationAuditLogReader (lecture audit pour console admin).

export interface AuditEntry {
  readonly id: string;
  readonly eventType: string;
  readonly actorId: string;
  readonly actorRole: 'admin' | 'system';
  readonly targetEmailHashHMAC: string | null;
  readonly reason: string | null;
  readonly metadata: Record<string, unknown>;
  readonly occurredAt: Date;
}

export interface NotificationAuditLogReader {
  list(filters: {
    cursor?: string;
    pageSize: number;
    eventType?: string;
    actorId?: string;
  }): Promise<{
    items: ReadonlyArray<AuditEntry>;
    nextCursor: string | null;
  }>;
}

export const NOTIFICATION_AUDIT_LOG_READER = Symbol.for('NotificationsAuditLogReader');
