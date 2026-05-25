// Module NestJS pour l'identité.
//
// Étendu par la feature 004 pour exposer les repositories légaux
// (LegalDocument + LegalAcceptance + LegalAcceptanceAnonymization).
// Les use cases (AcceptCguB2bUseCase, AcceptIntakeConsentUseCase,
// CheckCguUpToDateUseCase, AnonymizeLegalAcceptancesUseCase) seront
// ajoutés dans les phases 5-7 + N du plan 004.
//
// La façade publique LegalAcceptanceFacade (consommée par 002-voyageur-
// intake) sera ajoutée au moment de la phase 6 du plan 004 (T083-T084).

import { Module } from '@nestjs/common';
import { AUTH_SESSION_READER } from './application/ports/auth-session-reader.port';
import { LEGAL_ACCEPTANCE_ANONYMIZATION_WRITER } from './application/ports/legal-acceptance-anonymization-writer.port';
import { LEGAL_ACCEPTANCE_READER } from './application/ports/legal-acceptance-reader.port';
import { LEGAL_ACCEPTANCE_WRITER } from './application/ports/legal-acceptance-writer.port';
import { LEGAL_DOCUMENT_REPOSITORY } from './application/ports/legal-document-repository.port';
import { PrismaAuthSessionReader } from './infrastructure/prisma-auth-session-reader';
import { PrismaLegalAcceptanceAnonymizationRepository } from './infrastructure/prisma-legal-acceptance-anonymization-repository';
import { PrismaLegalAcceptanceRepository } from './infrastructure/prisma-legal-acceptance-repository';
import { PrismaLegalDocumentRepository } from './infrastructure/prisma-legal-document-repository';
import { AuthGuard } from './interface/auth.guard';

@Module({
  providers: [
    // --- Auth (T017-T019, feature 001/002 baseline) ---
    { provide: AUTH_SESSION_READER, useClass: PrismaAuthSessionReader },
    AuthGuard,

    // --- Legal (T034-T036 + T041 feature 004) ---
    // PrismaLegalAcceptanceRepository implémente Reader + Writer — on
    // l'enregistre une fois puis alias les deux symboles via useExisting
    // (sinon Nest crée deux instances distinctes du même repository).
    PrismaLegalAcceptanceRepository,
    { provide: LEGAL_ACCEPTANCE_READER, useExisting: PrismaLegalAcceptanceRepository },
    { provide: LEGAL_ACCEPTANCE_WRITER, useExisting: PrismaLegalAcceptanceRepository },
    { provide: LEGAL_DOCUMENT_REPOSITORY, useClass: PrismaLegalDocumentRepository },
    {
      provide: LEGAL_ACCEPTANCE_ANONYMIZATION_WRITER,
      useClass: PrismaLegalAcceptanceAnonymizationRepository,
    },
  ],
  exports: [
    // --- Auth (consommé par tous les modules métier) ---
    AUTH_SESSION_READER,
    AuthGuard,

    // --- Legal (consommé par les use cases d'identité côté 004 et par
    //     002-voyageur-intake via la façade LegalAcceptanceFacade à venir) ---
    LEGAL_ACCEPTANCE_READER,
    LEGAL_ACCEPTANCE_WRITER,
    LEGAL_DOCUMENT_REPOSITORY,
    LEGAL_ACCEPTANCE_ANONYMIZATION_WRITER,
  ],
})
export class IdentiteModule {}
