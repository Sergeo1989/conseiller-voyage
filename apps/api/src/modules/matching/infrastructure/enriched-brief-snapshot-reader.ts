// T025 [016 US2] — Décorateur : compose l'enrichi sur le snapshot déterministe.
//
// Lit le snapshot déterministe (008 via PrismaBriefSnapshotReader) PUIS l'enrichi
// via le port public `BriefEnrichmentQueryPort` (Principe V — seule surface
// inter-module), et applique la fonction pure `mergeEnrichmentIntoSnapshot`
// (résout `autre` + union destinations, sous seuil ; déterministe prévaut).
// Best-effort : si l'enrichi est absent/null, le scoring procède en déterministe.

import { BRIEF_ENRICHMENT_QUERY_PORT, type BriefEnrichmentQueryPort } from '@cv/shared/intake';
import { Inject, Injectable } from '@nestjs/common';
import type {
  BriefSnapshot,
  BriefSnapshotReader,
} from '../application/ports/brief-snapshot-reader.port';
import {
  type EnrichmentForScoring,
  mergeEnrichmentIntoSnapshot,
} from '../domain/services/merge-enrichment-into-snapshot';
import { PrismaBriefSnapshotReader } from './prisma-brief-snapshot-reader';

@Injectable()
export class EnrichedBriefSnapshotReader implements BriefSnapshotReader {
  constructor(
    @Inject(PrismaBriefSnapshotReader) private readonly base: PrismaBriefSnapshotReader,
    @Inject(BRIEF_ENRICHMENT_QUERY_PORT)
    private readonly enrichmentQuery: BriefEnrichmentQueryPort,
  ) {}

  async readByBriefId(briefId: string): Promise<BriefSnapshot | null> {
    const snapshot = await this.base.readByBriefId(briefId);
    if (!snapshot) return null;

    const view = await this.enrichmentQuery.getByBriefId(briefId);
    const enrichment: EnrichmentForScoring | null = view
      ? {
          status: view.status,
          enrichedSpeciality: view.enrichedSpeciality,
          enrichedDestinations: view.enrichedDestinations,
          confidence: view.confidence,
        }
      : null;

    return mergeEnrichmentIntoSnapshot(snapshot, enrichment);
  }
}
