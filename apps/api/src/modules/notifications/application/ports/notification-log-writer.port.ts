// T042 — Port NotificationLogWriter (ISP).

import type { NotificationStatus } from '../../domain/enums/notification-status.enum';

export interface InsertLogInput {
  readonly id: string;
  readonly correlationId: string;
  readonly sourceModule: 'conformite' | 'identite' | 'intake' | 'matching' | 'facturation';
  readonly eventType: string;
  readonly templateId: string;
  readonly recipientEmailClear: string;
  readonly recipientEmailCanonical: string;
  readonly recipientEmailHashHMAC: string;
  readonly recipientLocale: string;
  readonly enqueuedAt: Date;
  readonly status: NotificationStatus;
  /** Conservé pour retry dead-letter (T122). */
  readonly templateData?: Record<string, unknown>;
}

export interface UpdateStatusInput {
  readonly correlationId: string;
  readonly status: NotificationStatus;
  readonly timestamp: Date;
  readonly sesMessageId?: string;
  readonly lastError?: string | null;
  readonly nextAttemptAt?: Date | null;
  readonly attempts?: number;
}

export interface AnonymizeInput {
  readonly recipientEmailHashHMAC: string;
  readonly now: Date;
}

export interface NotificationLogWriter {
  /**
   * Crée une row. Idempotent via P2002 catch sur `correlationId` unique.
   * Retourne `{ created: false }` si déjà présent.
   */
  insert(input: InsertLogInput): Promise<{ id: string; created: boolean }>;
  updateStatus(input: UpdateStatusInput): Promise<void>;
  /**
   * Anonymise toutes les rows pour ce hash (Loi 25 effacement).
   * Retourne le nombre de rows anonymisées.
   */
  anonymizeByEmailHash(input: AnonymizeInput): Promise<number>;
  /**
   * Anonymise les rows dont `sentAt < beforeDate AND erasedAt IS NULL`
   * (rétention 24 mois — Loi 25 tableau de rétention).
   * Appelé par SweepRetentionUseCase (cron mensuel, T138).
   */
  sweepOldEntries(beforeDate: Date): Promise<number>;
}

export const NOTIFICATION_LOG_WRITER = Symbol.for('NotificationsLogWriter');
