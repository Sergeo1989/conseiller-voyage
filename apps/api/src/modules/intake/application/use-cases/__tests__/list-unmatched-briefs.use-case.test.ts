// T116 [TDD RED] — Tests ListUnmatchedBriefsUseCase (FR-026, US5).
// Brief actif depuis > 4h sans aucun conseiller notifié.

import { describe, expect, it } from 'vitest';
import { FakeClock, FakeVoyageurBriefStore, asBriefId, asContactId } from '../../__tests__/_fakes';
import type { VoyageurBriefRecord } from '../../ports';
import { ListUnmatchedBriefsUseCase } from '../list-unmatched-briefs.use-case';

const NOW = new Date('2026-05-15T10:00:00Z');
const CONTACT_ID = asContactId('22222222-2222-4222-8222-222222222222');

function buildUseCase() {
  const clock = new FakeClock(NOW);
  const briefs = new FakeVoyageurBriefStore();
  const useCase = new ListUnmatchedBriefsUseCase({ clock, briefReader: briefs });
  return { useCase, briefs };
}

function seedBrief(
  briefs: FakeVoyageurBriefStore,
  overrides: Partial<VoyageurBriefRecord>,
): VoyageurBriefRecord {
  const brief: VoyageurBriefRecord = {
    id: asBriefId(`33333333-3333-4333-8333-${String(briefs.briefs.size).padStart(12, '0')}`),
    voyageurContactId: CONTACT_ID,
    status: 'active',
    submittedAt: new Date('2026-05-15T01:00:00Z'),
    verifiedAt: new Date('2026-05-15T01:30:00Z'),
    expiresAt: new Date('2026-08-13T01:00:00Z'),
    consentGivenAt: new Date('2026-05-15T01:00:00Z'),
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
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
  briefs.seed(brief);
  return brief;
}

describe('ListUnmatchedBriefsUseCase', () => {
  it('retourne tableau vide si aucun brief unmatched', async () => {
    const { useCase } = buildUseCase();
    const r = await useCase.execute({ page: 1, pageSize: 20 });
    expect(r.items).toHaveLength(0);
    expect(r.total).toBe(0);
  });

  it('retourne les briefs actifs verifiedAt > 4h sans match (FR-026)', async () => {
    const { useCase, briefs } = buildUseCase();
    // 1 brief verifié il y a 5h → unmatched ✓
    seedBrief(briefs, { verifiedAt: new Date('2026-05-15T05:00:00Z') });
    // 1 brief verifié il y a 1h → trop récent, exclu
    seedBrief(briefs, { verifiedAt: new Date('2026-05-15T09:00:00Z') });
    // 1 brief matched → exclu
    seedBrief(briefs, {
      verifiedAt: new Date('2026-05-15T05:00:00Z'),
      status: 'matched',
    });

    const r = await useCase.execute({ page: 1, pageSize: 20 });
    expect(r.items).toHaveLength(1);
    expect(r.total).toBe(1);
  });

  it('paginate correctement (page 2, pageSize 1)', async () => {
    const { useCase, briefs } = buildUseCase();
    seedBrief(briefs, { verifiedAt: new Date('2026-05-15T05:00:00Z') });
    seedBrief(briefs, { verifiedAt: new Date('2026-05-15T04:00:00Z') });
    seedBrief(briefs, { verifiedAt: new Date('2026-05-15T03:00:00Z') });

    const page1 = await useCase.execute({ page: 1, pageSize: 1 });
    expect(page1.items).toHaveLength(1);
    expect(page1.total).toBe(3);

    const page2 = await useCase.execute({ page: 2, pageSize: 1 });
    expect(page2.items).toHaveLength(1);
    expect(page2.items[0]?.briefId).not.toBe(page1.items[0]?.briefId);
  });

  it('refuse pageSize > 100 (clamp à 100)', async () => {
    const { useCase, briefs } = buildUseCase();
    seedBrief(briefs, { verifiedAt: new Date('2026-05-15T05:00:00Z') });
    const r = await useCase.execute({ page: 1, pageSize: 500 });
    expect(r.items.length).toBeLessThanOrEqual(100);
  });
});
