// T062 — Consumer du topic event bus `voyageur.brief.activated`.
//
// MVP : classe injectable qui expose `handleBriefActivated(briefId)`.
// Le wiring BullMQ effectif (subscribe topic + call cette méthode) arrive
// avec T093 — extension du `OutboxPublisherJob` 003 pour drainer
// `matching_outbox_entries` ET dispatcher vers les consumers matching.
//
// En dev local, ce handler peut être appelé directement par un test
// d'intégration ou par un script CLI de simulation.

import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  type PerformMatchingResult,
  PerformMatchingUseCase,
} from '../../application/use-cases/perform-matching.use-case';

@Injectable()
export class BriefActivatedConsumer {
  private readonly logger = new Logger(BriefActivatedConsumer.name);

  constructor(
    @Inject(PerformMatchingUseCase)
    private readonly performMatching: PerformMatchingUseCase,
  ) {}

  /**
   * Handler appelé pour chaque event `voyageur.brief.activated` reçu.
   * Idempotent par construction — un replay du même briefId remonte
   * `replay_ignored` sans effet de bord.
   */
  async handleBriefActivated(briefId: string): Promise<PerformMatchingResult> {
    const result = await this.performMatching.execute({ briefId });
    if (result.kind === 'brief_not_found') {
      this.logger.warn(`Brief ${briefId} inconnu — skip matching (peut être anonymisé Loi 25)`);
    } else if (result.kind === 'replay_ignored') {
      this.logger.debug(`Brief ${briefId} déjà matché — replay ignoré (idempotence FR-004)`);
    } else {
      this.logger.log(
        `Matching ${result.matchingResultId} : status=${result.status} count=${result.matchedCount}`,
      );
    }
    return result;
  }
}
