// T136 — SweepRetentionUseCase.
//
// Anonymise les rows `notification_email_log` de plus de 24 mois
// (Loi 25 tableau de rétention — journal d'envoi = 24 mois, cf. plan.md).
// Idempotent : un second appel ne touche que les rows nouvellement éligibles.
// Appelé par NotificationRetentionSweepJob (cron mensuel, T138).

import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  NOTIFICATION_AUDIT_LOG_WRITER,
  type NotificationAuditLogWriter,
} from '../ports/notification-audit-log-writer.port';
import {
  NOTIFICATION_LOG_WRITER,
  type NotificationLogWriter,
} from '../ports/notification-log-writer.port';

export const RETENTION_MONTHS = 24;

export interface SweepRetentionOutput {
  readonly rowsAnonymized: number;
  readonly cutoffDate: Date;
}

@Injectable()
export class SweepRetentionUseCase {
  private readonly logger = new Logger(SweepRetentionUseCase.name);

  constructor(
    @Inject(NOTIFICATION_LOG_WRITER) private readonly logWriter: NotificationLogWriter,
    @Inject(NOTIFICATION_AUDIT_LOG_WRITER) private readonly auditWriter: NotificationAuditLogWriter,
  ) {}

  async execute(): Promise<SweepRetentionOutput> {
    const cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - RETENTION_MONTHS);

    const rowsAnonymized = await this.logWriter.sweepOldEntries(cutoffDate);

    if (rowsAnonymized > 0) {
      await this.auditWriter.append({
        eventType: 'notification.retention.swept',
        actorId: 'system',
        actorRole: 'system',
        reason: `Rétention 24 mois — ${rowsAnonymized} entrées anonymisées`,
        metadata: { rowsAnonymized, cutoffDate: cutoffDate.toISOString() },
      });
    }

    this.logger.log(
      `SweepRetention done: rowsAnonymized=${rowsAnonymized}, cutoff=${cutoffDate.toISOString()}`,
    );
    return { rowsAnonymized, cutoffDate };
  }
}

export const SWEEP_RETENTION_USE_CASE = Symbol.for('NotificationsSweepRetentionUseCase');
