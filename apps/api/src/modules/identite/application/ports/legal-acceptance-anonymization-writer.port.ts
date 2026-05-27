// Port LegalAcceptanceAnonymizationWriter (T033) — insertion des rows
// d'anonymisation Loi 25.
// Cf. ADR-0008 + specs/004-mentions-legales/data-model.md.

import type { LegalAcceptanceAnonymizationId, LegalAcceptanceId } from '@cv/legal';
import type { LegalAcceptanceAnonymization } from '../../domain/entities/legal-acceptance-anonymization.entity';

export interface LegalAcceptanceAnonymizationWriter {
  /**
   * Insère une row d'anonymisation. Unique par `acceptanceId` (au plus
   * une anonymisation par acceptance, garanti par contrainte DB).
   *
   * Appelé par `AnonymizeLegalAcceptancesUseCase` orchestré depuis
   * `EraseConseillerDataUseCase` (extension de la feature 001).
   *
   * @returns la row insérée
   * @throws si une anonymisation existe déjà pour cet `acceptanceId`
   *   (cas anormal : indique double appel non idempotent, à logger)
   */
  insertAnonymization(input: {
    id: LegalAcceptanceAnonymizationId;
    acceptanceId: LegalAcceptanceId;
    subjectIdHash: string;
    ipAddressMasked: string;
    userAgentFamily: string;
    anonymizedAt: Date;
    anonymizationSaltVersion: number;
  }): Promise<LegalAcceptanceAnonymization>;
}

export const LEGAL_ACCEPTANCE_ANONYMIZATION_WRITER = Symbol.for(
  'LegalAcceptanceAnonymizationWriter',
);
