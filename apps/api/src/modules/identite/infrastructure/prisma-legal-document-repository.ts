// T034 — PrismaLegalDocumentRepository.
// Implémente LegalDocumentRepository via Prisma.
//
// Cf. specs/004-mentions-legales/data-model.md + ADR-0008.
// Les rows sont strictement immutables (triggers PostgreSQL) — on n'expose
// que INSERT (insertVersion) et SELECT (find*).

import { type Prisma, prisma } from '@cv/db';
import type { LegalDocumentId, LegalDocumentType } from '@cv/legal';
import { LegalDocumentIdSchema } from '@cv/legal';
import { Injectable } from '@nestjs/common';
import type { LegalDocumentRepository } from '../application/ports/legal-document-repository.port';
import type { LegalDocument } from '../domain/entities/legal-document.entity';

@Injectable()
export class PrismaLegalDocumentRepository implements LegalDocumentRepository {
  async findById(id: LegalDocumentId): Promise<LegalDocument | null> {
    const row = await prisma.legalDocument.findUnique({ where: { id } });
    return row ? this.mapToDomain(row) : null;
  }

  async findByTypeAndVersion(
    type: LegalDocumentType,
    version: number,
  ): Promise<LegalDocument | null> {
    const row = await prisma.legalDocument.findUnique({
      where: { type_version: { type, version } },
    });
    return row ? this.mapToDomain(row) : null;
  }

  async findCurrentByType(type: LegalDocumentType, asOf: Date): Promise<LegalDocument | null> {
    // Sémantique : max(version) WHERE type = X AND effectiveAt <= asOf.
    // Index dédié (type, version DESC) rend la requête O(log n).
    const row = await prisma.legalDocument.findFirst({
      where: { type, effectiveAt: { lte: asOf } },
      orderBy: { version: 'desc' },
    });
    return row ? this.mapToDomain(row) : null;
  }

  async listEffectiveByType(
    type: LegalDocumentType,
    asOf: Date,
  ): Promise<ReadonlyArray<LegalDocument>> {
    const rows = await prisma.legalDocument.findMany({
      where: { type, effectiveAt: { lte: asOf } },
      orderBy: { version: 'desc' },
    });
    return rows.map((r) => this.mapToDomain(r));
  }

  async insertVersion(input: {
    type: LegalDocumentType;
    version: number;
    checksum: string;
    contentSnapshot: string;
    publishedAt: Date;
    effectiveAt: Date;
  }): Promise<LegalDocument> {
    // Idempotence : si (type, version) existe déjà avec même checksum,
    // retourner la row existante. Si checksum différent → exception
    // (drift). Cf. ADR-0008 + contract mdx-frontmatter.md.
    const existing = await prisma.legalDocument.findUnique({
      where: { type_version: { type: input.type, version: input.version } },
    });
    if (existing) {
      if (existing.checksum !== input.checksum) {
        throw new Error(
          `LegalDocument (type=${input.type}, version=${input.version}) already exists with different checksum: stored=${existing.checksum.slice(0, 12)}..., incoming=${input.checksum.slice(0, 12)}.... Drift detected — bump version before re-seeding.`,
        );
      }
      return this.mapToDomain(existing);
    }
    const created = await prisma.legalDocument.create({
      data: {
        type: input.type,
        version: input.version,
        checksum: input.checksum,
        contentSnapshot: input.contentSnapshot,
        publishedAt: input.publishedAt,
        effectiveAt: input.effectiveAt,
      },
    });
    return this.mapToDomain(created);
  }

  private mapToDomain(row: Prisma.LegalDocumentGetPayload<true>): LegalDocument {
    return {
      id: LegalDocumentIdSchema.parse(row.id),
      type: row.type,
      version: row.version,
      checksum: row.checksum,
      contentSnapshot: row.contentSnapshot,
      publishedAt: row.publishedAt,
      effectiveAt: row.effectiveAt,
    };
  }
}
