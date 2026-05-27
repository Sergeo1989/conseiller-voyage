// T139 — SuppressionListExpirationSweepJob.
//
// Cron quotidien (~03:00 ca-central-1).
// Orchestre SweepExpiredSuppressionsUseCase — expire les entrées soft bounce
// dont le TTL est atteint (fix I-6, spec.md).
// Réentrance protégée par flag `running`.

import { Injectable, Logger } from '@nestjs/common';
// biome-ignore lint/style/useImportType: NestJS DI requires runtime class references
import { SweepExpiredSuppressionsUseCase } from '../../application/use-cases/sweep-expired-suppressions.use-case';

@Injectable()
export class SuppressionListExpirationSweepJob {
  private readonly logger = new Logger(SuppressionListExpirationSweepJob.name);
  private running = false;

  constructor(private readonly sweepExpired: SweepExpiredSuppressionsUseCase) {}

  async sweep(): Promise<void> {
    if (this.running) {
      this.logger.warn('SuppressionListExpirationSweep already running — skipping this tick.');
      return;
    }
    this.running = true;
    try {
      const result = await this.sweepExpired.execute();
      this.logger.log(`SuppressionListExpirationSweep done: rowsExpired=${result.rowsExpired}`);
    } catch (error) {
      this.logger.error(
        `SuppressionListExpirationSweep failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      this.running = false;
    }
  }
}
