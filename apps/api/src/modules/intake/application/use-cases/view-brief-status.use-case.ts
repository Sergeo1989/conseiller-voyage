// T079 [TDD GREEN] — ViewBriefStatusUseCase.
//
// Lit un brief par briefId pour la page récap (US2). Vérifie que le
// contactId du cookie session voyageur correspond bien à
// voyageurContactId du brief — anti-IDOR.

import type { BriefSummary } from '@cv/shared/intake';
import type { VoyageurBriefId, VoyageurContactId } from '@cv/shared/intake';
import { Inject, Injectable } from '@nestjs/common';
import type { VoyageurBriefReader, VoyageurBriefRecord } from '../ports';

export interface ViewBriefStatusInput {
  readonly briefId: VoyageurBriefId;
  readonly contactId: VoyageurContactId;
}

export type ViewBriefStatusResult =
  | { readonly kind: 'ok'; readonly summary: BriefSummary }
  | { readonly kind: 'not_found' }
  | { readonly kind: 'unauthorized' }
  | { readonly kind: 'anonymised' };

export interface ViewBriefStatusDeps {
  readonly briefReader: VoyageurBriefReader;
}

@Injectable()
export class ViewBriefStatusUseCase {
  constructor(
    @Inject(ViewBriefStatusUseCase.DEPS_TOKEN)
    private readonly deps: ViewBriefStatusDeps,
  ) {}

  static readonly DEPS_TOKEN = Symbol.for('ViewBriefStatusDeps');

  async execute(input: ViewBriefStatusInput): Promise<ViewBriefStatusResult> {
    const brief = await this.deps.briefReader.findById(input.briefId);
    if (!brief) {
      return { kind: 'not_found' };
    }
    if (brief.status === 'anonymized') {
      return { kind: 'anonymised' };
    }
    if (brief.voyageurContactId !== input.contactId) {
      return { kind: 'unauthorized' };
    }
    return { kind: 'ok', summary: toBriefSummary(brief) };
  }
}

function toBriefSummary(brief: VoyageurBriefRecord): BriefSummary {
  return {
    briefId: brief.id,
    voyageurContactId: brief.voyageurContactId,
    status: brief.status,
    submittedAt: brief.submittedAt.toISOString(),
    verifiedAt: brief.verifiedAt?.toISOString() ?? null,
    expiresAt: brief.expiresAt.toISOString(),
    destinations: brief.destinations,
    departureDate: brief.departureDate.toISOString().slice(0, 10),
    returnDate: brief.returnDate.toISOString().slice(0, 10),
    datesFlexible: brief.datesFlexible,
    datesFlexibilityDays: brief.datesFlexibilityDays,
    adultsCount: brief.adultsCount,
    childrenAges: brief.childrenAges,
    infantsCount: brief.infantsCount,
    budgetRange: brief.budgetRange,
    conseillerLanguage: brief.conseillerLanguage,
    conseillerLanguageOther: brief.conseillerLanguageOther,
    speciality: brief.speciality,
    specialityOther: brief.specialityOther,
    familiarity: brief.familiarity,
  };
}
