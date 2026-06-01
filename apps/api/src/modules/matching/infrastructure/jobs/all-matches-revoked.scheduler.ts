// T078 — Scheduler BullMQ daily — détection cascade révocation.
//
// Cron daily à 02:00 ca-central-1. Appelle `DetectAllMatchesRevokedUseCase.scan`
// par batch de 100. Pattern hérité de feature 008 (intake-brief-expiration-sweep.job).
//
// Wiring BullMQ effectif (queue + repeatable job) configuré dans le module
// matching ou via @nestjs/schedule. Pour MVP : injectable simple, l'admin
// peut le déclencher manuellement OU laisser le cron BullMQ.

import { Inject, Injectable, Logger } from '@nestjs/common';
import { DetectAllMatchesRevokedUseCase } from '../../application/use-cases/detect-all-matches-revoked.use-case';

const BATCH_SIZE = 100;

@Injectable()
export class AllMatchesRevokedScheduler {
  private readonly logger = new Logger(AllMatchesRevokedScheduler.name);

  constructor(
    @Inject(DetectAllMatchesRevokedUseCase)
    private readonly useCase: DetectAllMatchesRevokedUseCase,
  ) {}

  /**
   * Scan une fenêtre. À appeler via BullMQ repeatable ou @nestjs/schedule
   * cron 02:00 ca-central-1 quotidien.
   */
  async runScan(): Promise<void> {
    const result = await this.useCase.scan({ batchSize: BATCH_SIZE });
    if (result.revokedCount > 0) {
      this.logger.warn(
        `All-matches-revoked scan : ${result.revokedCount}/${result.scannedCount} MR détectés (re-matching admin requis)`,
      );
    } else {
      this.logger.log(`All-matches-revoked scan : 0 incident sur ${result.scannedCount} MR`);
    }
  }
}
