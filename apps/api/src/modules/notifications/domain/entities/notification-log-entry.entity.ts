// T034 — Entité NotificationLogEntry (vue domaine de la row Prisma).

import type { NotificationStatus } from '../enums/notification-status.enum';

export interface NotificationLogEntry {
  readonly id: string;
  readonly correlationId: string;
  readonly sourceModule: 'conformite' | 'identite' | 'intake' | 'matching' | 'facturation';
  readonly eventType: string;
  readonly templateId: string;
  readonly recipientEmailClear: string | null;
  readonly recipientEmailCanonical: string | null;
  readonly recipientEmailHashHMAC: string;
  readonly recipientLocale: 'fr-CA' | 'en';
  readonly subject: string | null;
  readonly htmlBody: string | null;
  readonly textBody: string | null;
  readonly status: NotificationStatus;
  readonly attempts: number;
  readonly lastError: string | null;
  readonly nextAttemptAt: Date | null;
  readonly enqueuedAt: Date;
  readonly sentAt: Date | null;
  readonly deliveredAt: Date | null;
  readonly bouncedAt: Date | null;
  readonly complainedAt: Date | null;
  readonly failedAt: Date | null;
  readonly erasedAt: Date | null;
  readonly sesMessageId: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}
