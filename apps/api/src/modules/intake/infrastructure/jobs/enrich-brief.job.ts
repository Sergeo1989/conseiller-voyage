// T017 [016 US1] — EnrichBriefJob : consumer de `voyageur.brief.activated`.
//
// MVP : classe injectable exposant `handleBriefActivated(briefId)`. Le wiring bus
// effectif (subscribe topic) est le prérequis partagé déjà différé côté 011
// (`brief-activated.consumer` : « wiring effectif T093 ») ; en dev/test ce handler
// est appelé en in-process.
//
// Enrichit best-effort puis publie TOUJOURS `voyageur.brief.enriched` (même en
// fallback) → déclenche le matching repointé (T018). Le matching ne dépend jamais
// du LLM (Principe X) ; le sweep (T019) est le filet anti-perte de job.

import type { IntakeOutboxEntryId, VoyageurBriefId } from '@cv/shared/intake';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { UUID_GENERATOR, type UuidGenerator } from '../../../../common/ports/uuid-generator.port';
import { INTAKE_OUTBOX_WRITER, type IntakeOutboxWriter } from '../../application/ports';
import { EnrichBriefUseCase } from '../../application/use-cases/enrich-brief.use-case';

@Injectable()
export class EnrichBriefJob {
  private readonly logger = new Logger(EnrichBriefJob.name);

  constructor(
    @Inject(EnrichBriefUseCase) private readonly enrichBrief: EnrichBriefUseCase,
    @Inject(INTAKE_OUTBOX_WRITER) private readonly outbox: IntakeOutboxWriter,
    @Inject(UUID_GENERATOR) private readonly uuid: UuidGenerator,
  ) {}

  async handleBriefActivated(briefId: VoyageurBriefId): Promise<void> {
    const result = await this.enrichBrief.execute({ briefId });
    this.logger.log(
      `Enrichment ${briefId} : ${result.kind}${
        result.kind === 'enriched' ? ` (${result.status})` : ''
      }`,
    );

    // Toujours publier — succès comme fallback (le matching repointé consomme ceci).
    await this.outbox.enqueue({
      id: this.uuid.generate() as IntakeOutboxEntryId,
      eventType: 'voyageur.brief.enriched',
      payload: { briefId },
    });
  }
}
