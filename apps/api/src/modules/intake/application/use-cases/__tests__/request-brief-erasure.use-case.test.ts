// T103 [TDD RED] — Tests RequestBriefErasureUseCase (FR-022).
//
// Effacement d'UN brief précis. Le contact et les autres briefs persistent
// inchangés (Q4 clarify).
//
// Garanties testées :
//   - Confirmation phrase exacte ERASURE_BRIEF_PHRASE obligatoire
//   - Anti-IDOR : contactId du cookie ≠ voyageurContactId → unauthorized
//   - Idempotence : 2e appel sur brief déjà supprimé → already_deleted
//   - SC-008 : brief.status passe IMMÉDIATEMENT à anonymized (< 60s)
//   - Audit append-only intake.brief.erasure_requested
//   - Outbox voyageur.brief.deleted

import { describe, expect, it } from 'vitest';
import {
  FakeClock,
  FakeIntakeAuditLogWriter,
  FakeIntakeOutboxWriter,
  FakeUuidGenerator,
  FakeVoyageurBriefStore,
  asBriefId,
  asContactId,
} from '../../__tests__/_fakes';
import type { VoyageurBriefRecord } from '../../ports';
import { RequestBriefErasureUseCase } from '../request-brief-erasure.use-case';

const NOW = new Date('2026-05-15T12:00:00Z');
const BRIEF_ID = asBriefId('11111111-1111-4111-8111-111111111111');
const CONTACT_ID = asContactId('22222222-2222-4222-8222-222222222222');
const OTHER_CONTACT = asContactId('99999999-9999-4999-8999-999999999999');
const VALID_PHRASE = 'JE_CONFIRME_LA_SUPPRESSION_IRREVERSIBLE';

function buildUseCase() {
  const clock = new FakeClock(NOW);
  const uuid = new FakeUuidGenerator();
  const briefs = new FakeVoyageurBriefStore();
  const audit = new FakeIntakeAuditLogWriter();
  const outbox = new FakeIntakeOutboxWriter();
  const useCase = new RequestBriefErasureUseCase({
    clock,
    uuid,
    briefReader: briefs,
    briefWriter: briefs,
    audit,
    outbox,
  });
  return { useCase, clock, briefs, audit, outbox };
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

describe('RequestBriefErasureUseCase — golden path', () => {
  it('passe brief à anonymized immédiatement + audit + outbox', async () => {
    const { useCase, briefs, audit, outbox } = buildUseCase();
    seedBrief(briefs);

    const r = await useCase.execute({
      briefId: BRIEF_ID,
      contactId: CONTACT_ID,
      confirmation: VALID_PHRASE,
    });
    expect(r.kind).toBe('ok');

    const after = briefs.briefs.get(BRIEF_ID);
    expect(after?.status).toBe('anonymized');
    expect(after?.anonymizedAt).toEqual(NOW);
    expect(after?.erasureRequestedAt).toEqual(NOW);

    expect(audit.entries.some((e) => e.eventType === 'intake.brief.erasure_requested')).toBe(true);
    expect(outbox.entries.some((e) => e.eventType === 'voyageur.brief.deleted')).toBe(true);
  });
});

describe('RequestBriefErasureUseCase — refus', () => {
  it('refuse confirmation phrase incorrecte', async () => {
    const { useCase, briefs } = buildUseCase();
    seedBrief(briefs);
    const r = await useCase.execute({
      briefId: BRIEF_ID,
      contactId: CONTACT_ID,
      confirmation: 'JE_CONFIRME_LA_SUPPRESSION',
    });
    expect(r.kind).toBe('invalid_confirmation');
    expect(briefs.briefs.get(BRIEF_ID)?.status).toBe('active');
  });

  it('refuse confirmation vide', async () => {
    const { useCase, briefs } = buildUseCase();
    seedBrief(briefs);
    const r = await useCase.execute({
      briefId: BRIEF_ID,
      contactId: CONTACT_ID,
      confirmation: '',
    });
    expect(r.kind).toBe('invalid_confirmation');
  });

  it('refuse anti-IDOR : contactId différent', async () => {
    const { useCase, briefs } = buildUseCase();
    seedBrief(briefs);
    const r = await useCase.execute({
      briefId: BRIEF_ID,
      contactId: OTHER_CONTACT,
      confirmation: VALID_PHRASE,
    });
    expect(r.kind).toBe('unauthorized');
    expect(briefs.briefs.get(BRIEF_ID)?.status).toBe('active');
  });

  it('renvoie not_found si brief inexistant', async () => {
    const { useCase } = buildUseCase();
    const r = await useCase.execute({
      briefId: BRIEF_ID,
      contactId: CONTACT_ID,
      confirmation: VALID_PHRASE,
    });
    expect(r.kind).toBe('not_found');
  });

  it('renvoie already_deleted si brief déjà anonymized (idempotence)', async () => {
    const { useCase, briefs } = buildUseCase();
    seedBrief(briefs, {
      status: 'anonymized',
      anonymizedAt: new Date('2026-05-10T10:00:00Z'),
    });
    const r = await useCase.execute({
      briefId: BRIEF_ID,
      contactId: CONTACT_ID,
      confirmation: VALID_PHRASE,
    });
    expect(r.kind).toBe('already_deleted');
  });
});
