// Port LegalAcceptanceWriter (T032) — insertion d'acceptations légales.
// Append-only : aucun UPDATE/DELETE exposé. Idempotence sur la contrainte
// unique DB `(subjectId, documentType, documentVersion)`.
// Cf. specs/004-mentions-legales/data-model.md.

import type { LegalAcceptanceId, LegalAcceptanceSubjectType, LegalDocumentType } from '@cv/legal';
import type { LegalAcceptance } from '../../domain/entities/legal-acceptance.entity';

export interface LegalAcceptanceWriter {
  /**
   * Insère une nouvelle acceptation. Idempotent sur
   * `(subjectId, documentType, documentVersion)` — si une row existe
   * déjà avec ces 3 valeurs, retourne l'existante sans insert et sans
   * exception (idempotency naturelle Loi 25).
   *
   * @returns la row insérée OU l'existante en cas de rejeu
   * @throws si la version pointée n'existe pas ou n'est pas effective
   */
  insert(input: {
    id: LegalAcceptanceId;
    subjectType: LegalAcceptanceSubjectType;
    subjectId: string;
    documentType: LegalDocumentType;
    documentVersion: number;
    acceptedAt: Date;
    ipAddress: string;
    userAgent: string;
  }): Promise<LegalAcceptance>;
}

export const LEGAL_ACCEPTANCE_WRITER = Symbol.for('LegalAcceptanceWriter');
