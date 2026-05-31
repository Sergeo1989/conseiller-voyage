// T055 — Adapter Prisma : MatchingResultWriter + MatchingResultReader.
// L'INSERT atomique d'un MatchingResult + N × MatchingResultEntry vit dans
// une transaction Prisma unique. La contrainte UNIQUE INDEX partielle
// `idx_matching_results_brief_active` garantit l'idempotence FR-004 —
// un INSERT en conflit remonte P2002 que l'adapter capture.

import { prisma } from '@cv/db';
import type { MatchingResultId } from '@cv/shared/matching';
import { Injectable } from '@nestjs/common';
import type {
  MatchingResultEntity,
  MatchingResultReader,
} from '../application/ports/matching-result-reader.port';
import type {
  MatchingResultEntryInput,
  MatchingResultInput,
  MatchingResultWriteResult,
  MatchingResultWriter,
} from '../application/ports/matching-result-writer.port';

@Injectable()
export class PrismaMatchingResultRepository implements MatchingResultWriter, MatchingResultReader {
  async create(
    result: MatchingResultInput,
    entries: ReadonlyArray<MatchingResultEntryInput>,
  ): Promise<MatchingResultWriteResult> {
    try {
      await prisma.$transaction(async (tx) => {
        await tx.matchingResult.create({
          data: {
            id: result.id,
            briefId: result.briefId,
            status: result.status,
            matchedCount: result.matchedCount,
            algorithmVersion: result.algorithmVersion,
            suggestedConseillerId: result.suggestedConseillerId,
            boostApplied: result.boostApplied,
            computedAt: result.computedAt,
          },
        });
        if (entries.length > 0) {
          await tx.matchingResultEntry.createMany({
            data: entries.map((e) => ({
              matchingResultId: result.id,
              position: e.position,
              conseillerId: e.conseillerId,
              scoreBrut: e.scoreBrut,
              scoreFinal: e.scoreFinal,
              scoreComponents: e.scoreComponents as object,
              boosted: e.boosted,
            })),
          });
        }
      });
      return { kind: 'created', matchingResultId: result.id };
    } catch (err) {
      // P2002 = UNIQUE constraint violation (idempotence FR-004)
      if (isUniqueViolation(err)) return { kind: 'already_exists' };
      throw err;
    }
  }

  async markSuperseded(
    previousMatchingResultId: MatchingResultId,
    newMatchingResultId: MatchingResultId,
    supersededAt: Date,
  ): Promise<void> {
    await prisma.matchingResult.update({
      where: { id: previousMatchingResultId },
      data: {
        supersededAt,
        supersededByMatchingResultId: newMatchingResultId,
      },
    });
  }

  async findActiveByBriefId(briefId: string): Promise<MatchingResultEntity | null> {
    const row = await prisma.matchingResult.findFirst({
      where: { briefId, supersededAt: null },
      include: { entries: { orderBy: { position: 'asc' } } },
    });
    if (!row) return null;
    return toEntity(row);
  }

  async findActiveOkResultsForRevocationScan(
    limit: number,
  ): Promise<ReadonlyArray<MatchingResultEntity>> {
    const rows = await prisma.matchingResult.findMany({
      where: { status: 'ok', supersededAt: null, briefId: { not: null } },
      include: { entries: { orderBy: { position: 'asc' } } },
      take: limit,
      orderBy: { computedAt: 'asc' },
    });
    return rows.map(toEntity);
  }
}

interface PrismaWithCode {
  code?: string;
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as PrismaWithCode).code === 'P2002';
}

type PrismaMatchingResult = Awaited<ReturnType<typeof prisma.matchingResult.findFirst>> & {
  entries: Array<{
    position: number;
    conseillerId: string;
    scoreBrut: { toString(): string };
    scoreFinal: { toString(): string };
    scoreComponents: unknown;
    boosted: boolean;
  }>;
};

function toEntity(row: NonNullable<PrismaMatchingResult>): MatchingResultEntity {
  const components = row.entries.map((e) => {
    const c = (e.scoreComponents ?? {}) as Record<string, number>;
    return {
      position: e.position as 1 | 2 | 3,
      conseillerId: e.conseillerId,
      scoreBrut: Number(e.scoreBrut),
      scoreFinal: Number(e.scoreFinal),
      scoreComponents: {
        destination: c.destination ?? 0,
        geo: c.geo ?? 0,
        speciality: c.speciality ?? 0,
        familiarity: c.familiarity ?? 0,
      },
      boosted: e.boosted,
    };
  });

  return {
    id: row.id as MatchingResultId,
    briefId: row.briefId,
    status: row.status as 'ok' | 'partial' | 'empty',
    matchedCount: row.matchedCount as 0 | 1 | 2 | 3,
    algorithmVersion: row.algorithmVersion,
    suggestedConseillerId: row.suggestedConseillerId,
    boostApplied: row.boostApplied,
    computedAt: row.computedAt,
    supersededAt: row.supersededAt,
    supersededByMatchingResultId: row.supersededByMatchingResultId as MatchingResultId | null,
    entries: components,
  };
}
