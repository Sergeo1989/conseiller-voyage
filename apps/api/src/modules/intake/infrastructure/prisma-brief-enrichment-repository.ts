// T016 [016 US1] — PrismaBriefEnrichmentRepository.
// Persistance 1:1 idempotente par briefId (upsert). Mappe Decimal/Json Prisma
// vers les types du domaine. Aucun texte libre stocké (minimisation Loi 25).

import { prisma } from '@cv/db';
import type { CanonicalSpeciality, VoyageurBriefId } from '@cv/shared/intake';
import { Injectable } from '@nestjs/common';
import type { BriefEnrichmentRecord, BriefEnrichmentRepository } from '../application/ports';

type PrismaEnrichmentRow = NonNullable<
  Awaited<ReturnType<typeof prisma.briefEnrichment.findUnique>>
>;

function toRecord(row: PrismaEnrichmentRow): BriefEnrichmentRecord {
  return {
    briefId: row.briefId as VoyageurBriefId,
    status: row.status,
    enrichedSpeciality: row.enrichedSpeciality as CanonicalSpeciality | null,
    enrichedDestinations: (row.enrichedDestinations as string[] | null) ?? [],
    confidence: Number(row.confidence),
    failureReason: row.failureReason,
    providerVersion: row.providerVersion,
    inputTokens: row.inputTokens,
    outputTokens: row.outputTokens,
    createdAt: row.createdAt,
  };
}

@Injectable()
export class PrismaBriefEnrichmentRepository implements BriefEnrichmentRepository {
  async findByBriefId(briefId: VoyageurBriefId): Promise<BriefEnrichmentRecord | null> {
    const row = await prisma.briefEnrichment.findUnique({ where: { briefId } });
    return row ? toRecord(row) : null;
  }

  async save(record: BriefEnrichmentRecord): Promise<void> {
    const data = {
      status: record.status,
      enrichedSpeciality: record.enrichedSpeciality,
      enrichedDestinations: [...record.enrichedDestinations],
      confidence: record.confidence,
      failureReason: record.failureReason,
      providerVersion: record.providerVersion,
      inputTokens: record.inputTokens,
      outputTokens: record.outputTokens,
      createdAt: record.createdAt,
    };
    await prisma.briefEnrichment.upsert({
      where: { briefId: record.briefId },
      create: { briefId: record.briefId, ...data },
      update: data,
    });
  }
}
