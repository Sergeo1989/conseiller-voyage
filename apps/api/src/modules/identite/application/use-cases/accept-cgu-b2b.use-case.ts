// T066 — AcceptCguB2bUseCase (US3 P2).
//
// Enregistre l'acceptation explicite des CGU B2B par un conseiller ou
// admin authentifié. Idempotent sur (userId, documentVersion) — appel
// répété retourne la row existante sans dupliquer.
//
// Garde-fous métier :
//   - RBAC : `voyageur` rejeté (cgu_b2b est pour usage professionnel).
//   - Version inconnue → NotFoundException (404).
//   - Version pas encore effective (asOf < effectiveAt) → NotFoundException.
//   - Version supersédée (une version plus récente existe et est effective) → ConflictException.
//
// Cf. specs/004-mentions-legales/contracts/legal-acceptance.port.md US3.

import { LegalAcceptanceIdSchema } from '@cv/legal';
import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
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

export type AcceptCguB2bActorRole = 'conseiller' | 'admin' | 'voyageur';

export interface AcceptCguB2bInput {
  readonly userId: string;
  readonly actorRole: AcceptCguB2bActorRole;
  readonly documentVersion: number;
  readonly ipAddress: string;
  readonly userAgent: string;
}

export interface AcceptCguB2bResult {
  readonly acceptance: LegalAcceptance;
  /** `true` si l'acceptation existait déjà (rejeu idempotent), `false` si nouvellement créée. */
  readonly alreadyAccepted: boolean;
}

@Injectable()
export class AcceptCguB2bUseCase {
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

  async execute(input: AcceptCguB2bInput): Promise<AcceptCguB2bResult> {
    if (input.actorRole === 'voyageur') {
      throw new ForbiddenException({ code: 'CGU_B2B_NOT_APPLICABLE_TO_VOYAGEUR' });
    }

    const asOf = this.clock.now();
    const targetDoc = await this.documents.findByTypeAndVersion('cgu_b2b', input.documentVersion);
    if (!targetDoc) {
      throw new NotFoundException({
        code: 'UNKNOWN_LEGAL_DOCUMENT_VERSION',
        type: 'cgu_b2b',
        version: input.documentVersion,
      });
    }
    if (targetDoc.effectiveAt > asOf) {
      throw new NotFoundException({
        code: 'LEGAL_DOCUMENT_VERSION_NOT_EFFECTIVE',
        type: 'cgu_b2b',
        version: input.documentVersion,
        effectiveAt: targetDoc.effectiveAt.toISOString(),
      });
    }

    const currentDoc = await this.documents.findCurrentByType('cgu_b2b', asOf);
    if (currentDoc && currentDoc.version > input.documentVersion) {
      throw new ConflictException({
        code: 'LEGAL_DOCUMENT_VERSION_SUPERSEDED',
        type: 'cgu_b2b',
        attemptedVersion: input.documentVersion,
        currentVersion: currentDoc.version,
      });
    }

    // Idempotence métier : si une row (subjectId, documentType, documentVersion)
    // existe déjà, retourner l'existante sans tenter un INSERT.
    const existing = await this.reader.findLatestBySubject({
      subjectId: input.userId,
      documentType: 'cgu_b2b',
    });
    if (existing && existing.documentVersion === input.documentVersion) {
      return { acceptance: existing, alreadyAccepted: true };
    }

    const acceptance = await this.writer.insert({
      id: LegalAcceptanceIdSchema.parse(this.uuids.generate()),
      subjectType: 'user',
      subjectId: input.userId,
      documentType: 'cgu_b2b',
      documentVersion: input.documentVersion,
      acceptedAt: asOf,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    });

    return { acceptance, alreadyAccepted: false };
  }
}

export const ACCEPT_CGU_B2B_USE_CASE = Symbol.for('AcceptCguB2bUseCase');
