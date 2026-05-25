// T036 — PrismaLegalAcceptanceAnonymizationRepository.
// Implémente LegalAcceptanceAnonymizationWriter via Prisma.
//
// Cf. specs/004-mentions-legales/data-model.md + ADR-0008.
// Table append-only (trigger PostgreSQL bloque UPDATE/DELETE). Une seule
// row par acceptanceId (contrainte unique DB). Lookup pour idempotence.

import { type Prisma, prisma } from '@cv/db';
import { Injectable } from '@nestjs/common';
import type { LegalAcceptanceAnonymizationWriter } from '../application/ports/legal-acceptance-anonymization-writer.port';
import type { LegalAcceptanceAnonymization } from '../domain/entities/legal-acceptance-anonymization.entity';

@Injectable()
export class PrismaLegalAcceptanceAnonymizationRepository
  implements LegalAcceptanceAnonymizationWriter
{
  async insertAnonymization(input: {
    id: import('@cv/legal').LegalAcceptanceAnonymizationId;
    acceptanceId: import('@cv/legal').LegalAcceptanceId;
    subjectIdHash: string;
    ipAddressMasked: string;
    userAgentFamily: string;
    anonymizedAt: Date;
    anonymizationSaltVersion: number;
  }): Promise<LegalAcceptanceAnonymization> {
    // Idempotence : si une anonymisation existe déjà pour cet acceptanceId
    // (contrainte unique DB), retourne l'existante. Indique un double appel
    // qui ne devrait pas arriver mais qu'on gère défensivement plutôt que
    // de propager une erreur 500 côté EraseConseillerDataUseCase.
    const existing = await prisma.legalAcceptanceAnonymization.findUnique({
      where: { acceptanceId: input.acceptanceId },
    });
    if (existing) {
      return this.mapToDomain(existing);
    }
    const created = await prisma.legalAcceptanceAnonymization.create({
      data: {
        id: input.id,
        acceptanceId: input.acceptanceId,
        subjectIdHash: input.subjectIdHash,
        ipAddressMasked: input.ipAddressMasked,
        userAgentFamily: input.userAgentFamily,
        anonymizedAt: input.anonymizedAt,
        anonymizationSaltVersion: input.anonymizationSaltVersion,
      },
    });
    return this.mapToDomain(created);
  }

  private mapToDomain(
    row: Prisma.LegalAcceptanceAnonymizationGetPayload<true>,
  ): LegalAcceptanceAnonymization {
    return {
      id: row.id as import('@cv/legal').LegalAcceptanceAnonymizationId,
      acceptanceId: row.acceptanceId as import('@cv/legal').LegalAcceptanceId,
      subjectIdHash: row.subjectIdHash,
      ipAddressMasked: row.ipAddressMasked,
      userAgentFamily: row.userAgentFamily,
      anonymizedAt: row.anonymizedAt,
      anonymizationSaltVersion: row.anonymizationSaltVersion,
    };
  }
}
