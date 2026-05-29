// T078 [TDD RED] — Tests ViewBriefStatusUseCase.
// US2 P2 : voyageur consulte le statut d'un brief actif.

import { describe, expect, it } from 'vitest';
import { FakeVoyageurBriefStore, asBriefId, asContactId } from '../../__tests__/_fakes';
import type { VoyageurBriefRecord } from '../../ports';
import { ViewBriefStatusUseCase } from '../view-brief-status.use-case';

const BRIEF_ID = asBriefId('11111111-1111-4111-8111-111111111111');
const CONTACT_ID = asContactId('22222222-2222-4222-8222-222222222222');

function buildUseCase() {
  const briefs = new FakeVoyageurBriefStore();
  const useCase = new ViewBriefStatusUseCase({ briefReader: briefs });
  return { useCase, briefs };
}

function seedBrief(
  briefs: FakeVoyageurBriefStore,
  overrides: Partial<VoyageurBriefRecord> = {},
): VoyageurBriefRecord {
  const brief: VoyageurBriefRecord = {
    id: BRIEF_ID,
    voyageurContactId: CONTACT_ID,
    status: 'active',
    submittedAt: new Date('2026-05-01T10:00:00Z'),
    verifiedAt: new Date('2026-05-01T10:15:00Z'),
    expiresAt: new Date('2026-07-30T10:00:00Z'),
    consentGivenAt: new Date('2026-05-01T10:00:00Z'),
    erasureRequestedAt: null,
    anonymizedAt: null,
    abuseMarkedAt: null,
    destinations: [{ country: 'IT' }],
    departureDate: new Date('2027-03-15'),
    returnDate: new Date('2027-03-30'),
    datesFlexible: false,
    datesFlexibilityDays: null,
    adultsCount: 2,
    childrenAges: [],
    infantsCount: 0,
    budgetRange: 'between_5k_10k',
    budgetNote: null,
    conseillerLanguage: 'fr',
    conseillerLanguageOther: null,
    speciality: 'lune_de_miel',
    specialityOther: null,
    familiarity: 'experienced_traveler',
    idempotencyKey: null,
    createdAt: new Date('2026-05-01T10:00:00Z'),
    updatedAt: new Date('2026-05-01T10:15:00Z'),
    ...overrides,
  };
  briefs.seed(brief);
  return brief;
}

describe('ViewBriefStatusUseCase', () => {
  it('renvoie un BriefSummary pour un brief actif', async () => {
    const { useCase, briefs } = buildUseCase();
    seedBrief(briefs);
    const r = await useCase.execute({ briefId: BRIEF_ID, contactId: CONTACT_ID });
    expect(r.kind).toBe('ok');
    if (r.kind === 'ok') {
      expect(r.summary.briefId).toBe(BRIEF_ID);
      expect(r.summary.status).toBe('active');
      expect(r.summary.speciality).toBe('lune_de_miel');
    }
  });

  it('renvoie not_found si briefId inexistant', async () => {
    const { useCase } = buildUseCase();
    const r = await useCase.execute({ briefId: BRIEF_ID, contactId: CONTACT_ID });
    expect(r.kind).toBe('not_found');
  });

  it('renvoie unauthorized si contactId du cookie ≠ voyageurContactId du brief', async () => {
    const { useCase, briefs } = buildUseCase();
    seedBrief(briefs);
    const otherContact = asContactId('99999999-9999-4999-8999-999999999999');
    const r = await useCase.execute({ briefId: BRIEF_ID, contactId: otherContact });
    expect(r.kind).toBe('unauthorized');
  });

  it('renvoie anonymised si brief.status=anonymized', async () => {
    const { useCase, briefs } = buildUseCase();
    seedBrief(briefs, { status: 'anonymized', anonymizedAt: new Date('2026-05-15T12:00:00Z') });
    const r = await useCase.execute({ briefId: BRIEF_ID, contactId: CONTACT_ID });
    expect(r.kind).toBe('anonymised');
  });
});
