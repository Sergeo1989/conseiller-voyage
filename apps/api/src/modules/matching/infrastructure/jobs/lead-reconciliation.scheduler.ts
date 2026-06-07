// T046 [US3] — LeadReconciliationScheduler.
// Déclenche périodiquement le sweep de réconciliation (mode dégradé bus HS,
// ADR-0026). Wiring de l'intervalle dans MatchingModule.onModuleInit.

import { Inject, Injectable, Logger } from '@nestjs/common';
import { ReconcileLeadsUseCase } from '../../application/use-cases/reconcile-leads.use-case';

const SWEEP_LIMIT = 100;

@Injectable()
export class LeadReconciliationScheduler {
  private readonly logger = new Logger(LeadReconciliationScheduler.name);
  private running = false;

  constructor(@Inject(ReconcileLeadsUseCase) private readonly reconcile: ReconcileLeadsUseCase) {}

  /** Réentrant safe : skip si déjà en cours. */
  async sweep(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const result = await this.reconcile.execute({ limit: SWEEP_LIMIT });
      if (result.recreated > 0) {
        this.logger.warn(
          `Réconciliation : ${result.recreated} lead(s) recréé(s) sur ${result.scanned} MR orphelin(s) (bus HS ?)`,
        );
      }
    } catch (error) {
      this.logger.error(
        `LeadReconciliation sweep failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      this.running = false;
    }
  }
}
