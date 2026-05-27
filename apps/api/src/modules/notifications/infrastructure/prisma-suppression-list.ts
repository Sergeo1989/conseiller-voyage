// T050 — PrismaSuppressionList adapter.
//
// lookup par hash (lookup avant envoi), upsert (bounce/complaint),
// softRemove (admin console), markExpired (cron).

import { prisma } from '@cv/db';
import { Prisma } from '@cv/db';
import { Injectable } from '@nestjs/common';
import type { SuppressionListReader } from '../application/ports/suppression-list-reader.port';
import type {
  RemoveSuppressionInput,
  SuppressionListWriter,
  UpsertSuppressionInput,
} from '../application/ports/suppression-list-writer.port';
import type { SuppressionListEntry } from '../domain/entities/suppression-list-entry.entity';
import type { SuppressionReason } from '../domain/enums/suppression-reason.enum';

@Injectable()
export class PrismaSuppressionList implements SuppressionListReader, SuppressionListWriter {
  async findById(id: string): Promise<SuppressionListEntry | null> {
    const row = await prisma.suppressionListEntry.findUnique({ where: { id } });
    return row as SuppressionListEntry | null;
  }

  async findByEmailHash(hash: string): Promise<SuppressionListEntry | null> {
    const row = await prisma.suppressionListEntry.findFirst({
      where: { recipientEmailHashHMAC: hash },
      orderBy: { addedAt: 'desc' },
    });
    return row as SuppressionListEntry | null;
  }

  async list(filters: {
    reason?: SuppressionReason;
    includeRemoved?: boolean;
    page: number;
    pageSize: number;
  }): Promise<{ items: ReadonlyArray<SuppressionListEntry>; totalCount: number }> {
    const where = {
      ...(filters.reason && { reason: filters.reason }),
      ...(!filters.includeRemoved && { removedAt: null }),
    };
    const [items, totalCount] = await Promise.all([
      prisma.suppressionListEntry.findMany({
        where,
        skip: (filters.page - 1) * filters.pageSize,
        take: filters.pageSize,
        orderBy: { addedAt: 'desc' },
      }),
      prisma.suppressionListEntry.count({ where }),
    ]);
    return { items: items as ReadonlyArray<SuppressionListEntry>, totalCount };
  }

  async upsert(input: UpsertSuppressionInput): Promise<{ id: string; created: boolean }> {
    const existing = await prisma.suppressionListEntry.findFirst({
      where: {
        recipientEmailHashHMAC: input.recipientEmailHashHMAC,
        removedAt: null,
      },
      orderBy: { addedAt: 'desc' },
    });

    if (existing) {
      await prisma.suppressionListEntry.update({
        where: { id: existing.id },
        data: {
          reason: input.reason,
          source: input.source,
          details:
            input.details !== undefined
              ? (input.details as unknown as Prisma.InputJsonValue)
              : Prisma.DbNull,
          expiresAt: input.expiresAt,
        },
      });
      return { id: existing.id, created: false };
    }

    const row = await prisma.suppressionListEntry.create({
      data: {
        recipientEmailHashHMAC: input.recipientEmailHashHMAC,
        reason: input.reason,
        source: input.source,
        details:
          input.details !== undefined
            ? (input.details as unknown as Prisma.InputJsonValue)
            : Prisma.DbNull,
        expiresAt: input.expiresAt,
      },
    });
    return { id: row.id, created: true };
  }

  async softRemove(input: RemoveSuppressionInput): Promise<void> {
    await prisma.suppressionListEntry.update({
      where: { id: input.id },
      data: {
        removedAt: new Date(),
        removedByActorId: input.removedByActorId,
        removedReason: input.removedReason,
      },
    });
  }

  async markExpired(ids: ReadonlyArray<string>): Promise<number> {
    const result = await prisma.suppressionListEntry.updateMany({
      where: {
        id: { in: [...ids] },
        expiresAt: { lte: new Date() },
        removedAt: null,
      },
      data: { removedAt: new Date() },
    });
    return result.count;
  }

  async sweepExpired(now: Date): Promise<number> {
    const result = await prisma.suppressionListEntry.updateMany({
      where: {
        expiresAt: { lte: now },
        removedAt: null,
      },
      data: { removedAt: now },
    });
    return result.count;
  }
}
