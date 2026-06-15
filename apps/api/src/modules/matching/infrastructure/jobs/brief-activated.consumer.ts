// T062 — Consumer déclencheur du matching.
//
// REPOINTÉ par 016 (T018) : consomme désormais `voyageur.brief.enriched`
// (publié par l'intake après l'enrichissement best-effort) AU LIEU de
// `voyageur.brief.activated`. L'enrichissement précède ainsi le scoring ; le
// matching ne dépend jamais du LLM (l'événement est publié même en fallback).
//
// MVP : classe injectable qui expose `handleBriefActivated(briefId)`. Le wiring
// bus effectif (subscribe topic) reste le prérequis partagé déjà différé (cf. 011
// « wiring effectif T093 ») — même gate staging/infra. En dev/test, ce handler
// est appelé en in-process.

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
