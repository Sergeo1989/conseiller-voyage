// T116 — DataRetentionSweepJob (Phase N).
//
// Tourne quotidiennement. Pour le module conformité, sa seule
// responsabilité est de drainer les demandes d'effacement Loi 25 :
//   - listCompliancesWithErasureRequested (erasureRequestedAt non-null,
//     anonymizedAt null)
//   - Pour chacune, appelle EraseConseillerDataUseCase
//     (qui supprime S3 objets + anonymise compliance)
//
// Les autres règles de rétention transversales (briefs > 24 mois,
// profils désactivés > 6 mois) appartiennent aux modules respectifs
// (intake pour les briefs, identité pour les profils) — chaque module
// expose son propre DataRetentionSweepJob ou une méthode appelée par
// un orchestrateur global.

import type { ConseillerComplianceId } from '@cv/shared/conformite';
import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  CONFORMITE_READER,
  type ConformiteReader,
} from '../../application/ports/conformite-reader.port';
// biome-ignore lint/style/useImportType: NestJS DI requires runtime class references
import { EraseConseillerDataUseCase } from '../../application/use-cases/erase-conseiller-data.use-case';

@Injectable()
export class DataRetentionSweepJob {
  private readonly logger = new Logger(DataRetentionSweepJob.name);
  private running = false;

  constructor(
    @Inject(CONFORMITE_READER) private readonly reader: ConformiteReader,
    private readonly eraseData: EraseConseillerDataUseCase,
  ) {}

  /**
   * Retourne le nombre d'effacements traités lors de cette invocation,
   * ou `skipped: true` si un sweep tourne déjà (verrou anti-overlap).
   * Utile pour les déclenchements manuels via endpoint admin
   * (force le sweep sans attendre le scheduler 24h).
   */
  async sweep(): Promise<{ processed: number; skipped: boolean }> {
    if (this.running) {
      this.logger.warn('DataRetentionSweep already running — skipping.');
      return { processed: 0, skipped: true };
    }
    this.running = true;
    try {
      const processed = await this.processBatch();
      this.logger.log(`DataRetentionSweep done: ${processed} erasures completed.`);
      return { processed, skipped: false };
    } catch (error) {
      this.logger.error(
        `DataRetentionSweep failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    } finally {
      this.running = false;
    }
  }

  private async processBatch(): Promise<number> {
    const pending = await this.reader.listCompliancesWithErasureRequested();
    this.logger.log(`DataRetentionSweep: ${pending.length} erasure requests to process.`);
    let processed = 0;
    for (const compliance of pending) {
      const ok = await this.tryErase(compliance.id);
      if (ok) processed += 1;
    }
    return processed;
  }

  private async tryErase(complianceId: ConseillerComplianceId): Promise<boolean> {
    try {
      await this.eraseData.execute({ conseillerComplianceId: complianceId });
      return true;
    } catch (error) {
      this.logger.error(
        `Erasure failed for compliance ${complianceId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }
  }
}
