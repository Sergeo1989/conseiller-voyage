// T083 — LegalAcceptanceFacade (US4 P2).
//
// API publique du module `identité` consommée par `002-voyageur-intake`
// au moment de la soumission du brief (double consentement Loi 25).
//
// Principe V (frontière modulaire) :
//   - Aucun type Prisma exposé.
//   - Aucun client transactionnel partagé.
//   - Le caller n'orchestre que la séquence, pas la transaction interne
//     du module identité (la façade gère sa propre persistance).
//
// Pattern : research R7 décision *Alt 2* — chaque appel `acceptForBrief`
// encapsule une transaction interne. Le module 002 garde son propre
// lifecycle de brief (consent_pending → consent_ok → submitted) en
// dehors de la façade.
//
// Cf. specs/004-mentions-legales/contracts/legal-acceptance.port.md.

import type { LegalAcceptanceId, LegalDocumentType } from '@cv/legal';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { CLOCK, type Clock } from '../../../../common/ports/clock.port';
import {
  LEGAL_DOCUMENT_REPOSITORY,
  type LegalDocumentRepository,
} from '../../application/ports/legal-document-repository.port';
// biome-ignore lint/style/useImportType: NestJS DI requires runtime class reference
import { AcceptIntakeConsentUseCase } from '../../application/use-cases/accept-intake-consent.use-case';

export type LegalAcceptanceFacadeDocumentType = 'confidentialite' | 'cgu_b2c';

export interface AcceptForBriefInput {
  readonly briefId: string;
  readonly documentType: LegalAcceptanceFacadeDocumentType;
  readonly documentVersion: number;
  readonly acceptedAt: Date;
  readonly ipAddress: string;
  readonly userAgent: string;
}

export interface LegalAcceptanceRecord {
  readonly id: LegalAcceptanceId;
  readonly briefId: string;
  readonly documentType: LegalAcceptanceFacadeDocumentType;
  readonly documentVersion: number;
  readonly acceptedAt: Date;
}

/**
 * Erreur métier exposée à l'API publique. Sans détail Prisma (ne fuit
 * pas l'implémentation interne).
 */
export class UnknownLegalDocumentVersionError extends Error {
  readonly code = 'UNKNOWN_LEGAL_DOCUMENT_VERSION';
  constructor(
    readonly documentType: LegalDocumentType,
    readonly version: number,
  ) {
    super(`Unknown ${documentType} version ${version}`);
  }
}

@Injectable()
export class LegalAcceptanceFacade {
  constructor(
    private readonly acceptUseCase: AcceptIntakeConsentUseCase,
    @Inject(LEGAL_DOCUMENT_REPOSITORY)
    private readonly documents: LegalDocumentRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /**
   * Enregistre une acceptation pour un brief voyageur anonyme.
   * Idempotent. Lève `UnknownLegalDocumentVersionError` si la version
   * est inconnue ou pas encore effective.
   */
  async acceptForBrief(input: AcceptForBriefInput): Promise<LegalAcceptanceRecord> {
    try {
      const result = await this.acceptUseCase.execute({
        briefId: input.briefId,
        documentType: input.documentType,
        documentVersion: input.documentVersion,
        acceptedAt: input.acceptedAt,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
      });
      return {
        id: result.acceptance.id,
        briefId: input.briefId,
        documentType: input.documentType,
        documentVersion: result.acceptance.documentVersion,
        acceptedAt: result.acceptance.acceptedAt,
      };
    } catch (err) {
      // Re-mappe l'erreur HTTP NotFoundException vers une erreur métier
      // typée (l'API publique ne doit pas fuir d'exceptions NestJS).
      if (err instanceof NotFoundException) {
        throw new UnknownLegalDocumentVersionError(input.documentType, input.documentVersion);
      }
      throw err;
    }
  }

  /**
   * Récupère la version courante effective d'un type de document. Utilisé
   * par 002 pour afficher la version dans l'UI et transmettre la même
   * valeur à `acceptForBrief`. Évite la race d'un bump entre affichage
   * et soumission.
   */
  async getCurrentVersion(documentType: LegalAcceptanceFacadeDocumentType): Promise<number> {
    const current = await this.documents.findCurrentByType(documentType, this.clock.now());
    if (!current) {
      throw new UnknownLegalDocumentVersionError(documentType, 0);
    }
    return current.version;
  }
}

export const LEGAL_ACCEPTANCE_FACADE = Symbol.for('LegalAcceptanceFacade');
