// T050 [US1] — PrismaMagicLinkTokenRepository.
// Implémente MagicLinkTokenWriter. Le clear token n'est JAMAIS stocké :
// seul son SHA-256 hex 64 vit en DB (R1 + ADR-0018).

import { prisma } from '@cv/db';
import type { MagicLinkTokenId, VoyageurBriefId } from '@cv/shared/intake';
import { Injectable } from '@nestjs/common';
import type {
  CreateTokenInput,
  MagicLinkPurpose,
  MagicLinkTokenRecord,
  MagicLinkTokenWriter,
} from '../application/ports';

interface PrismaTokenRow {
  id: string;
  briefId: string;
  tokenHash: string;
  purpose: MagicLinkPurpose;
  expiresAt: Date;
  consumedAt: Date | null;
  createdAt: Date;
}

function toRecord(row: PrismaTokenRow): MagicLinkTokenRecord {
  return {
    id: row.id as MagicLinkTokenId,
    briefId: row.briefId as VoyageurBriefId,
    tokenHash: row.tokenHash,
    purpose: row.purpose,
    expiresAt: row.expiresAt,
    consumedAt: row.consumedAt,
    createdAt: row.createdAt,
  };
}

@Injectable()
export class PrismaMagicLinkTokenRepository implements MagicLinkTokenWriter {
  async create(input: CreateTokenInput): Promise<void> {
    await prisma.magicLinkToken.create({
      data: {
        id: input.id,
        briefId: input.briefId,
        tokenHash: input.tokenHash,
        purpose: input.purpose,
        expiresAt: input.expiresAt,
      },
    });
  }

  async findByHash(tokenHash: string): Promise<MagicLinkTokenRecord | null> {
    const row = await prisma.magicLinkToken.findUnique({ where: { tokenHash } });
    return row ? toRecord(row as PrismaTokenRow) : null;
  }

  async markConsumed(args: {
    readonly tokenId: MagicLinkTokenId;
    readonly consumedAt: Date;
  }): Promise<void> {
    await prisma.magicLinkToken.update({
      where: { id: args.tokenId },
      data: { consumedAt: args.consumedAt },
    });
  }

  async expirePendingByBrief(args: {
    readonly briefId: VoyageurBriefId;
    readonly purpose: MagicLinkPurpose;
    readonly expiredAt: Date;
  }): Promise<number> {
    // Pas de status field — on "expire" en mettant expiresAt à la valeur
    // passée (rétrocompatible avec isExpired). Les tokens consommés sont
    // ignorés (consumedAt non-null).
    const result = await prisma.magicLinkToken.updateMany({
      where: {
        briefId: args.briefId,
        purpose: args.purpose,
        consumedAt: null,
        expiresAt: { gt: args.expiredAt },
      },
      data: { expiresAt: args.expiredAt },
    });
    return result.count;
  }
}
