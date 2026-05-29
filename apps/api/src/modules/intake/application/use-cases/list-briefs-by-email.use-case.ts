// T081 [TDD GREEN] — ListBriefsByEmailUseCase.
// FR-017 : voyageur consulte ses briefs actifs depuis la page récap.

import type { BriefSummary, VoyageurContactId } from '@cv/shared/intake';
import { Inject, Injectable } from '@nestjs/common';
import type { VoyageurBriefReader, VoyageurContactReader } from '../ports';

export interface ListBriefsByEmailInput {
  readonly contactId: VoyageurContactId;
}

export type ListBriefsByEmailResult =
  | { readonly kind: 'ok'; readonly briefs: ReadonlyArray<BriefSummary> }
  | { readonly kind: 'contact_not_found' }
  | { readonly kind: 'contact_anonymised' };

export interface ListBriefsByEmailDeps {
  readonly briefReader: VoyageurBriefReader;
  readonly contactReader: VoyageurContactReader;
}

@Injectable()
export class ListBriefsByEmailUseCase {
  constructor(
    @Inject(ListBriefsByEmailUseCase.DEPS_TOKEN)
    private readonly deps: ListBriefsByEmailDeps,
  ) {}

  static readonly DEPS_TOKEN = Symbol.for('ListBriefsByEmailDeps');

  async execute(input: ListBriefsByEmailInput): Promise<ListBriefsByEmailResult> {
    const contact = await this.deps.contactReader.findById(input.contactId);
    if (!contact) {
      return { kind: 'contact_not_found' };
    }
    if (contact.anonymizedAt !== null) {
      return { kind: 'contact_anonymised' };
    }
    const records = await this.deps.briefReader.listActiveByContactId(input.contactId);
    const briefs: ReadonlyArray<BriefSummary> = records.map((r) => ({
      briefId: r.id,
      voyageurContactId: r.voyageurContactId,
      status: r.status,
      submittedAt: r.submittedAt.toISOString(),
      verifiedAt: r.verifiedAt?.toISOString() ?? null,
      expiresAt: r.expiresAt.toISOString(),
      destinations: r.destinations,
      departureDate: r.departureDate.toISOString().slice(0, 10),
      returnDate: r.returnDate.toISOString().slice(0, 10),
      datesFlexible: r.datesFlexible,
      datesFlexibilityDays: r.datesFlexibilityDays,
      adultsCount: r.adultsCount,
      childrenAges: r.childrenAges,
      infantsCount: r.infantsCount,
      budgetRange: r.budgetRange,
      conseillerLanguage: r.conseillerLanguage,
      conseillerLanguageOther: r.conseillerLanguageOther,
      speciality: r.speciality,
      specialityOther: r.specialityOther,
      familiarity: r.familiarity,
    }));
    return { kind: 'ok', briefs };
  }
}
