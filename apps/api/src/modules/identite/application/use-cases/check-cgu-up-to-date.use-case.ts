// T068 — CheckCguUpToDateUseCase (US3 P2).
//
// Indique au middleware version-check (T076) si un user authentifié a
// accepté la version courante du CGU B2B. Trois retours possibles :
//   - 'up_to_date'      : version acceptée === version courante
//   - 'outdated'        : version acceptée < version courante (re-acceptation requise)
//   - 'never_accepted'  : aucune acceptation enregistrée (signup pré-feature-004
//                         ou compte créé hors flow signup avec checkbox CGU)
//
// Idempotent. Aucun effet de bord. Cf. plan 004 + research R4.

import { type LegalVersionComparisonResult, compareLegalVersion } from '@cv/legal';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { CLOCK, type Clock } from '../../../../common/ports/clock.port';
import {
  LEGAL_ACCEPTANCE_READER,
  type LegalAcceptanceReader,
} from '../ports/legal-acceptance-reader.port';
import {
  LEGAL_DOCUMENT_REPOSITORY,
  type LegalDocumentRepository,
} from '../ports/legal-document-repository.port';

export interface CheckCguUpToDateInput {
  readonly userId: string;
}

export interface CheckCguUpToDateResult {
  readonly status: LegalVersionComparisonResult;
  readonly currentVersion: number;
  readonly acceptedVersion: number | null;
}

@Injectable()
export class CheckCguUpToDateUseCase {
  constructor(
    @Inject(LEGAL_DOCUMENT_REPOSITORY)
    private readonly documents: LegalDocumentRepository,
    @Inject(LEGAL_ACCEPTANCE_READER)
    private readonly reader: LegalAcceptanceReader,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: CheckCguUpToDateInput): Promise<CheckCguUpToDateResult> {
    const asOf = this.clock.now();
    const currentDoc = await this.documents.findCurrentByType('cgu_b2b', asOf);
    if (!currentDoc) {
      // Aucune version effective n'est seedée — anomalie de déploiement.
      throw new NotFoundException({
        code: 'NO_EFFECTIVE_CGU_B2B_VERSION',
      });
    }

    const lastAccepted = await this.reader.findLatestBySubject({
      subjectId: input.userId,
      documentType: 'cgu_b2b',
    });

    const acceptedVersion = lastAccepted?.documentVersion ?? null;
    const status = compareLegalVersion(currentDoc.version, acceptedVersion);

    return {
      status,
      currentVersion: currentDoc.version,
      acceptedVersion,
    };
  }
}

export const CHECK_CGU_UP_TO_DATE_USE_CASE = Symbol.for('CheckCguUpToDateUseCase');
