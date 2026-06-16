// T019 [016 US1] — Sweep de réconciliation de l'enrichissement (pattern 012).
//
// Filet anti-perte de job : si l'`EnrichBriefJob` a été perdu entre l'activation
// et l'enrichissement, un brief activé reste SANS `BriefEnrichment`. Ce sweep
// périodique re-déclenche l'enrichissement (idempotent — réutilise s'il existe)
// puis re-publie `voyageur.brief.enriched` → le matching s'exécute. Garantit que
// le matching n'est jamais durablement bloqué (Principe X).
//
// À planifier via @nestjs/schedule / BullMQ repeatable (intervalle ~ quelques min).

import { prisma } from '@cv/db';
import type { VoyageurBriefId } from '@cv/shared/intake';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { CLOCK, type Clock } from '../../../../common/ports/clock.port';
import { EnrichBriefJob } from './enrich-brief.job';

const BATCH_SIZE = 100;
// Délai au-delà duquel un brief activé sans enrichissement est considéré perdu.
const STALE_AFTER_MS = 5 * 60 * 1000;

@Injectable()
export class EnrichmentReconciliationSweep {
  private readonly logger = new Logger(EnrichmentReconciliationSweep.name);

  constructor(
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(EnrichBriefJob) private readonly enrichBriefJob: EnrichBriefJob,
  ) {}

  /** Re-déclenche l'enrichissement des briefs activés restés sans enrichissement. */
  async sweep(): Promise<number> {
    const cutoff = new Date(this.clock.nowMs() - STALE_AFTER_MS);
    const stale = await prisma.voyageurBrief.findMany({
      where: {
        OR: [{ status: 'active' }, { status: 'matched' }],
        verifiedAt: { not: null, lt: cutoff },
        briefEnrichment: { is: null },
      },
      take: BATCH_SIZE,
      orderBy: { verifiedAt: 'asc' },
      select: { id: true },
    });

    for (const brief of stale) {
      await this.enrichBriefJob.handleBriefActivated(brief.id as VoyageurBriefId);
    }

    if (stale.length > 0) {
      this.logger.log(`Réconciliation enrichissement : ${stale.length} briefs re-déclenchés.`);
    }
    return stale.length;
  }
}
