// T024 [016 US2] — Adapter Prisma du port PUBLIC BriefEnrichmentQueryPort.
// Vue minimale lue par le matching (Principe V) : aucun texte libre, aucune PII,
// aucun montant — seulement de quoi enrichir l'entrée de scoring.

import { prisma } from '@cv/db';
import type { BriefEnrichmentView, CanonicalSpeciality } from '@cv/shared/intake';
import { Injectable } from '@nestjs/common';
import type { BriefEnrichmentQueryPort } from '../application/ports';

@Injectable()
export class PrismaBriefEnrichmentQuery implements BriefEnrichmentQueryPort {
  async getByBriefId(briefId: string): Promise<BriefEnrichmentView | null> {
    const row = await prisma.briefEnrichment.findUnique({
      where: { briefId },
      select: {
        briefId: true,
        status: true,
        enrichedSpeciality: true,
        enrichedDestinations: true,
        confidence: true,
      },
    });
    if (!row) return null;
    return {
      briefId: row.briefId,
      status: row.status,
      enrichedSpeciality: row.enrichedSpeciality as CanonicalSpeciality | null,
      enrichedDestinations: (row.enrichedDestinations as string[] | null) ?? [],
      confidence: Number(row.confidence),
    };
  }
}
