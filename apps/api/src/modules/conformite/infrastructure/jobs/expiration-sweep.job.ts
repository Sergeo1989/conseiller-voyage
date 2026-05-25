// T086 + T087 — ExpirationSweepJob.
//
// Tourne quotidiennement à 02:00 (ca-central-1). Orchestre :
//   1. Charge la map conseillerCompliance → conseillerId
//   2. SendExpirationRemindersUseCase (J-60/30/7 fanout)
//   3. PropagateExpirationsUseCase (bascule verified→suspended)
//
// Scheduling externalisé au ConformiteModule (T072) — onModuleInit
// pose un setInterval ou (mieux à terme) un BullMQ repeatable job.

import type { ConseillerId } from '@cv/shared/conformite';
import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  CONFORMITE_READER,
  type ConformiteReader,
} from '../../application/ports/conformite-reader.port';
// biome-ignore lint/style/useImportType: NestJS DI requires runtime class references
import { PropagateExpirationsUseCase } from '../../application/use-cases/propagate-expirations.use-case';
// biome-ignore lint/style/useImportType: NestJS DI requires runtime class references
import { SendExpirationRemindersUseCase } from '../../application/use-cases/send-expiration-reminders.use-case';

@Injectable()
export class ExpirationSweepJob {
  private readonly logger = new Logger(ExpirationSweepJob.name);
  private running = false;

  constructor(
    @Inject(CONFORMITE_READER) private readonly reader: ConformiteReader,
    private readonly sendReminders: SendExpirationRemindersUseCase,
    private readonly propagate: PropagateExpirationsUseCase,
  ) {}

  /** Drain idempotent. Réentrance protégée par flag `running`. */
  async sweep(): Promise<void> {
    if (this.running) {
      this.logger.warn('ExpirationSweep already running — skipping this tick.');
      return;
    }
    this.running = true;
    try {
      const conseillerMap = await this.buildConseillerMap();
      const reminderResult = await this.sendReminders.execute({
        conseillerByComplianceId: conseillerMap,
      });
      const propagateResult = await this.propagate.execute();
      this.logger.log(
        `ExpirationSweep done: sent=${reminderResult.sentCount} ` +
          `(60d=${reminderResult.byKind.reminder_60d}, ` +
          `30d=${reminderResult.byKind.reminder_30d}, ` +
          `7d=${reminderResult.byKind.reminder_7d}), ` +
          `suspended=${propagateResult.suspendedCount}`,
      );
    } catch (error) {
      this.logger.error(
        `ExpirationSweep failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      this.running = false;
    }
  }

  /**
   * T087 — Charge en une passe la map conseillerComplianceId → conseillerId
   * pour toutes les compliances ACTIVES (pas seulement verified — on inclut
   * les suspended dont les certs renouvelés expirent). Pour MVP année 1
   * (500 conseillers) une seule requête suffit ; partitionner si > 10k.
   */
  private async buildConseillerMap(): Promise<ReadonlyMap<string, ConseillerId>> {
    const verifieds = await this.reader.listVerifiedCompliances();
    const map = new Map<string, ConseillerId>();
    for (const c of verifieds) {
      map.set(c.id, c.conseillerId);
    }
    return map;
  }
}
