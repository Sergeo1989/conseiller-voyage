// T138 — NotificationRetentionSweepJob.
//
// Cron mensuel (jour 1 du mois, ~02:00 ca-central-1).
// Orchestre SweepRetentionUseCase — anonymise le journal d'envoi > 24 mois.
// Réentrance protégée par flag `running` (même pattern que ExpirationSweepJob).

import { Injectable, Logger } from '@nestjs/common';
// biome-ignore lint/style/useImportType: NestJS DI requires runtime class references
import { SweepRetentionUseCase } from '../../application/use-cases/sweep-retention.use-case';

@Injectable()
export class NotificationRetentionSweepJob {
  private readonly logger = new Logger(NotificationRetentionSweepJob.name);
  private running = false;

  constructor(private readonly sweepRetention: SweepRetentionUseCase) {}

  async sweep(): Promise<void> {
    if (this.running) {
      this.logger.warn('NotificationRetentionSweep already running — skipping this tick.');
      return;
    }
    this.running = true;
    try {
      const result = await this.sweepRetention.execute();
      this.logger.log(
        `NotificationRetentionSweep done: rowsAnonymized=${result.rowsAnonymized}, cutoff=${result.cutoffDate.toISOString()}`,
      );
    } catch (error) {
      this.logger.error(
        `NotificationRetentionSweep failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      this.running = false;
    }
  }
}
