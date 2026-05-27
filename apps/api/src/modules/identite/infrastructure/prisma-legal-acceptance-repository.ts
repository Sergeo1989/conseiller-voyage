// T035 — PrismaLegalAcceptanceRepository.
// Implémente LegalAcceptanceReader + LegalAcceptanceWriter via Prisma.
//
// Cf. specs/004-mentions-legales/data-model.md + ADR-0008.
//
// Garde-fou critique : la méthode findWithAnonymization() est la SEULE
// route lecture autorisée hors contexte d'idempotence. Elle fait un
// LEFT JOIN avec auth_legal_acceptance_anonymizations et retourne les
// valeurs masquées si la row a été anonymisée Loi 25.
//
// Le linter custom tools/check-legal-acceptance-access.ts (T040) refuse
// tout import direct de prisma.legalAcceptance.find* hors ce fichier.

import { type Prisma, prisma } from '@cv/db';
import type { LegalDocumentType } from '@cv/legal';
import { LegalAcceptanceIdSchema } from '@cv/legal';
import { Injectable } from '@nestjs/common';
import type { LegalAcceptanceReader } from '../application/ports/legal-acceptance-reader.port';
import type { LegalAcceptanceWriter } from '../application/ports/legal-acceptance-writer.port';
import type {
  LegalAcceptanceAnonymization,
  LegalAcceptanceWithAnonymization,
} from '../domain/entities/legal-acceptance-anonymization.entity';
import type { LegalAcceptance } from '../domain/entities/legal-acceptance.entity';

@Injectable()
export class PrismaLegalAcceptanceRepository
  implements LegalAcceptanceReader, LegalAcceptanceWriter
{
  // --- READER ---

  async findLatestBySubject(input: {
    subjectId: string;
    documentType: LegalDocumentType;
  }): Promise<LegalAcceptance | null> {
    // Index : auth_legal_acceptances(subjectId, documentType, acceptedAt DESC)
    const row = await prisma.legalAcceptance.findFirst({
      where: { subjectId: input.subjectId, documentType: input.documentType },
      orderBy: { acceptedAt: 'desc' },
    });
    return row ? this.mapAcceptance(row) : null;
  }

  async findWithAnonymization(
    acceptanceId: string,
  ): Promise<LegalAcceptanceWithAnonymization | null> {
    const row = await prisma.legalAcceptance.findUnique({
      where: { id: acceptanceId },
      include: { anonymization: true },
    });
    if (!row) return null;
    return {
      acceptance: this.mapAcceptance(row),
      anonymization: row.anonymization ? this.mapAnonymization(row.anonymization) : null,
      isAnonymized: row.anonymization !== null,
    };
  }

  async listBySubject(subjectId: string): Promise<ReadonlyArray<LegalAcceptanceWithAnonymization>> {
    const rows = await prisma.legalAcceptance.findMany({
      where: { subjectId },
      include: { anonymization: true },
      orderBy: { acceptedAt: 'desc' },
    });
    return rows.map((r) => ({
      acceptance: this.mapAcceptance(r),
      anonymization: r.anonymization ? this.mapAnonymization(r.anonymization) : null,
      isAnonymized: r.anonymization !== null,
    }));
  }

  // --- WRITER ---

  async insert(input: {
    id: import('@cv/legal').LegalAcceptanceId;
    subjectType: import('@cv/legal').LegalAcceptanceSubjectType;
    subjectId: string;
    documentType: LegalDocumentType;
    documentVersion: number;
    acceptedAt: Date;
    ipAddress: string;
    userAgent: string;
  }): Promise<LegalAcceptance> {
    // Idempotence Loi 25 : si (subjectId, documentType, documentVersion)
    // existe, retourne l'existante (no-op silencieux). Contrainte unique
    // DB garantit l'invariant à 2 niveaux : check applicatif + REJET DB.
    const existing = await prisma.legalAcceptance.findUnique({
      where: {
        subjectId_documentType_documentVersion: {
          subjectId: input.subjectId,
          documentType: input.documentType,
          documentVersion: input.documentVersion,
        },
      },
    });
    if (existing) {
      return this.mapAcceptance(existing);
    }
    const created = await prisma.legalAcceptance.create({
      data: {
        id: input.id,
        subjectType: input.subjectType,
        subjectId: input.subjectId,
        documentType: input.documentType,
        documentVersion: input.documentVersion,
        acceptedAt: input.acceptedAt,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
      },
    });
    return this.mapAcceptance(created);
  }

  // --- Mappers ---

  private mapAcceptance(row: Prisma.LegalAcceptanceGetPayload<true>): LegalAcceptance {
    return {
      id: LegalAcceptanceIdSchema.parse(row.id),
      subjectType: row.subjectType,
      subjectId: row.subjectId,
      documentType: row.documentType,
      documentVersion: row.documentVersion,
      acceptedAt: row.acceptedAt,
      ipAddress: row.ipAddress,
      userAgent: row.userAgent,
    };
  }

  private mapAnonymization(
    row: Prisma.LegalAcceptanceAnonymizationGetPayload<true>,
  ): LegalAcceptanceAnonymization {
    return {
      id: row.id as import('@cv/legal').LegalAcceptanceAnonymizationId,
      acceptanceId: LegalAcceptanceIdSchema.parse(row.acceptanceId),
      subjectIdHash: row.subjectIdHash,
      ipAddressMasked: row.ipAddressMasked,
      userAgentFamily: row.userAgentFamily,
      anonymizedAt: row.anonymizedAt,
      anonymizationSaltVersion: row.anonymizationSaltVersion,
    };
  }
}
