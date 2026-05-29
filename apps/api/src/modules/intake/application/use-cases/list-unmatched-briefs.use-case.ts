// T117 [TDD GREEN] — ListUnmatchedBriefsUseCase (FR-026, US5 admin).
// File des briefs actifs verifiedAt > 4h sans match — pagination.

import type { BriefSummary } from '@cv/shared/intake';
import { Inject, Injectable } from '@nestjs/common';
import type { Clock } from '../../../../common/ports/clock.port';
import type { VoyageurBriefReader } from '../ports';

const HOURS_THRESHOLD = 4;
const MAX_PAGE_SIZE = 100;

export interface ListUnmatchedBriefsInput {
  readonly page: number;
  readonly pageSize: number;
}

export interface ListUnmatchedBriefsResult {
  readonly items: ReadonlyArray<BriefSummary>;
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}

export interface ListUnmatchedBriefsDeps {
  readonly clock: Clock;
  readonly briefReader: VoyageurBriefReader;
}

@Injectable()
export class ListUnmatchedBriefsUseCase {
  constructor(
    @Inject(ListUnmatchedBriefsUseCase.DEPS_TOKEN)
    private readonly deps: ListUnmatchedBriefsDeps,
  ) {}

  static readonly DEPS_TOKEN = Symbol.for('ListUnmatchedBriefsDeps');

  async execute(input: ListUnmatchedBriefsInput): Promise<ListUnmatchedBriefsResult> {
    const page = Math.max(1, input.page);
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, input.pageSize));

    const result = await this.deps.briefReader.listUnmatchedSince({
      hoursThreshold: HOURS_THRESHOLD,
      nowMs: this.deps.clock.nowMs(),
      page,
      pageSize,
    });

    const items: ReadonlyArray<BriefSummary> = result.items.map((r) => ({
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

    return { items, total: result.total, page, pageSize };
  }
}
