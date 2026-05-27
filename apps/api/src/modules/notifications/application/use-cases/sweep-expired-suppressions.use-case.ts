// T137 — SweepExpiredSuppressionsUseCase.
//
// Expire les entrées de suppression dont le TTL est atteint
// (soft bounces : expiresAt non-null, < now, removedAt null).
// Conforme au fix I-6 de la review adversariale (spec.md).
// Appelé par SuppressionListExpirationSweepJob (cron quotidien, T139).

import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  NOTIFICATION_AUDIT_LOG_WRITER,
  type NotificationAuditLogWriter,
} from '../ports/notification-audit-log-writer.port';
import {
  SUPPRESSION_LIST_WRITER,
  type SuppressionListWriter,
} from '../ports/suppression-list-writer.port';

export interface SweepExpiredSuppressionsOutput {
  readonly rowsExpired: number;
  readonly sweepDate: Date;
}

@Injectable()
export class SweepExpiredSuppressionsUseCase {
  private readonly logger = new Logger(SweepExpiredSuppressionsUseCase.name);

  constructor(
    @Inject(SUPPRESSION_LIST_WRITER) private readonly suppressionWriter: SuppressionListWriter,
    @Inject(NOTIFICATION_AUDIT_LOG_WRITER) private readonly auditWriter: NotificationAuditLogWriter,
  ) {}

  async execute(): Promise<SweepExpiredSuppressionsOutput> {
    const sweepDate = new Date();
    const rowsExpired = await this.suppressionWriter.sweepExpired(sweepDate);

    if (rowsExpired > 0) {
      await this.auditWriter.append({
        eventType: 'notification.suppression.expired_swept',
        actorId: 'system',
        actorRole: 'system',
        reason: `Expiration TTL soft bounces — ${rowsExpired} entrées expirées`,
        metadata: { rowsExpired, sweepDate: sweepDate.toISOString() },
      });
    }

    this.logger.log(`SweepExpiredSuppressions done: rowsExpired=${rowsExpired}`);
    return { rowsExpired, sweepDate };
  }
}

export const SWEEP_EXPIRED_SUPPRESSIONS_USE_CASE = Symbol.for(
  'NotificationsSweepExpiredSuppressionsUseCase',
);
