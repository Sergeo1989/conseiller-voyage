// T005 [016] — Port interne BriefEnrichmentRepository.
//
// Persistance de l'enrichissement (1:1 idempotent par briefId). Aucun champ
// texte libre ni langue (minimisation Loi 25). L'adaptateur Prisma (T016) fait
// un upsert `ON CONFLICT (briefId)`.

import type {
  CanonicalSpeciality,
  EnrichmentFailureReason,
  EnrichmentStatus,
  VoyageurBriefId,
} from '@cv/shared/intake';

export interface BriefEnrichmentRecord {
  readonly briefId: VoyageurBriefId;
  readonly status: EnrichmentStatus;
  readonly enrichedSpeciality: CanonicalSpeciality | null;
  readonly enrichedDestinations: ReadonlyArray<string>;
  readonly confidence: number;
  readonly failureReason: EnrichmentFailureReason | null;
  readonly providerVersion: string | null;
  readonly inputTokens: number | null;
  readonly outputTokens: number | null;
  readonly createdAt: Date;
}

export interface BriefEnrichmentRepository {
  findByBriefId(briefId: VoyageurBriefId): Promise<BriefEnrichmentRecord | null>;
  /** Upsert idempotent par briefId. */
  save(record: BriefEnrichmentRecord): Promise<void>;
}

export const BRIEF_ENRICHMENT_REPOSITORY = Symbol.for('BriefEnrichmentRepository');
