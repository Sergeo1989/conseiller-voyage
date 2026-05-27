// T082 — AcceptIntakeConsentUseCase (US4 P2).
//
// Enregistre l'acceptation d'un document légal (confidentialite ou
// cgu_b2c) par un brief voyageur anonyme. Consommé via la façade
// publique `LegalAcceptanceFacade` par le module 002-voyageur-intake.
//
// Idempotent sur (briefId, documentType, documentVersion) — appel
// répété retourne l'existante sans dupliquer.
//
// La transaction Prisma est encapsulée côté repository writer
// (l'insert utilise la contrainte unique DB pour idempotence). Le
// module appelant n'a aucun client Prisma à passer (cf. research R7
// alt 2 — pas de partage de client cross-module).
//
// Cf. specs/004-mentions-legales/contracts/legal-acceptance.port.md US4.

import { LegalAcceptanceIdSchema } from '@cv/legal';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { CLOCK, type Clock } from '../../../../common/ports/clock.port';
import { UUID_GENERATOR, type UuidGenerator } from '../../../../common/ports/uuid-generator.port';
import type { LegalAcceptance } from '../../domain/entities/legal-acceptance.entity';
import {
  LEGAL_ACCEPTANCE_READER,
  type LegalAcceptanceReader,
} from '../ports/legal-acceptance-reader.port';
import {
  LEGAL_ACCEPTANCE_WRITER,
  type LegalAcceptanceWriter,
} from '../ports/legal-acceptance-writer.port';
import {
  LEGAL_DOCUMENT_REPOSITORY,
  type LegalDocumentRepository,
} from '../ports/legal-document-repository.port';

export type IntakeConsentDocumentType = 'confidentialite' | 'cgu_b2c';

export interface AcceptIntakeConsentInput {
  readonly briefId: string;
  readonly documentType: IntakeConsentDocumentType;
  readonly documentVersion: number;
  readonly acceptedAt: Date;
  readonly ipAddress: string;
  readonly userAgent: string;
}

export interface AcceptIntakeConsentResult {
  readonly acceptance: LegalAcceptance;
  readonly alreadyAccepted: boolean;
}

@Injectable()
export class AcceptIntakeConsentUseCase {
  constructor(
    @Inject(LEGAL_DOCUMENT_REPOSITORY)
    private readonly documents: LegalDocumentRepository,
    @Inject(LEGAL_ACCEPTANCE_READER)
    private readonly reader: LegalAcceptanceReader,
    @Inject(LEGAL_ACCEPTANCE_WRITER)
    private readonly writer: LegalAcceptanceWriter,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(UUID_GENERATOR) private readonly uuids: UuidGenerator,
  ) {}

  async execute(input: AcceptIntakeConsentInput): Promise<AcceptIntakeConsentResult> {
    const asOf = this.clock.now();
    const doc = await this.documents.findByTypeAndVersion(
      input.documentType,
      input.documentVersion,
    );
    if (!doc) {
      throw new NotFoundException({
        code: 'UNKNOWN_LEGAL_DOCUMENT_VERSION',
        type: input.documentType,
        version: input.documentVersion,
      });
    }
    if (doc.effectiveAt > asOf) {
      throw new NotFoundException({
        code: 'LEGAL_DOCUMENT_VERSION_NOT_EFFECTIVE',
        type: input.documentType,
        version: input.documentVersion,
        effectiveAt: doc.effectiveAt.toISOString(),
      });
    }

    const existing = await this.reader.findLatestBySubject({
      subjectId: input.briefId,
      documentType: input.documentType,
    });
    if (existing && existing.documentVersion === input.documentVersion) {
      return { acceptance: existing, alreadyAccepted: true };
    }

    const acceptance = await this.writer.insert({
      id: LegalAcceptanceIdSchema.parse(this.uuids.generate()),
      subjectType: 'brief',
      subjectId: input.briefId,
      documentType: input.documentType,
      documentVersion: input.documentVersion,
      acceptedAt: input.acceptedAt,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    });

    return { acceptance, alreadyAccepted: false };
  }
}

export const ACCEPT_INTAKE_CONSENT_USE_CASE = Symbol.for('AcceptIntakeConsentUseCase');
