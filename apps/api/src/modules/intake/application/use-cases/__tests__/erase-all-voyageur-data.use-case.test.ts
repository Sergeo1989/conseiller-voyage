// T115a [TDD RED] — Tests EraseAllVoyageurDataUseCase (FR-022a, C1, Q4).
//
// Effacement GLOBAL : contact + tous ses briefs en une opération
// transactionnelle.
//
// Garanties testées :
//   - Phrase exacte ERASURE_ALL_PHRASE distincte de FR-022
//   - acknowledgedBriefCount === count actuel (anti-stale UI)
//   - Cascade : contact.applyAnonymisation + tous briefs → anonymized
//   - Idempotence : déjà supprimé → already_deleted
//   - Audit intake.contact.erase_all_requested
//   - Outbox voyageur.brief.deleted × N

import { describe, expect, it } from 'vitest';
import {
  FakeClock,
  FakeIntakeAuditLogWriter,
  FakeIntakeOutboxWriter,
  FakeUuidGenerator,
  FakeVoyageurBriefStore,
  FakeVoyageurContactStore,
  asBriefId,
  asContactId,
} from '../../__tests__/_fakes';
import type { VoyageurBriefRecord, VoyageurContactRecord } from '../../ports';
import { EraseAllVoyageurDataUseCase } from '../erase-all-voyageur-data.use-case';

const NOW = new Date('2026-05-15T12:00:00Z');
const CONTACT_ID = asContactId('22222222-2222-4222-8222-222222222222');
const VALID_PHRASE = 'JE_CONFIRME_LA_SUPPRESSION_DE_TOUTES_MES_DONNEES';
const EMAIL = 'marie.dupont@gmail.com';

function buildUseCase() {
  const clock = new FakeClock(NOW);
  const uuid = new FakeUuidGenerator();
  const briefs = new FakeVoyageurBriefStore();
  const contacts = new FakeVoyageurContactStore();
  const audit = new FakeIntakeAuditLogWriter();
  const outbox = new FakeIntakeOutboxWriter();
  const useCase = new EraseAllVoyageurDataUseCase({
    clock,
    uuid,
    contactReader: contacts,
    contactWriter: contacts,
    briefReader: briefs,
    briefWriter: briefs,
    audit,
    outbox,
  });
  return { useCase, briefs, contacts, audit, outbox };
}

function seedContact(contacts: FakeVoyageurContactStore): VoyageurContactRecord {
  const c: VoyageurContactRecord = {
    id: CONTACT_ID,
    email: EMAIL,
    emailHashAfterErasure: null,
    firstName: 'Marie',
    lastName: 'Dupont',
    phone: null,
    postalCode: null,
    briefsCount24h: 0,
    briefsCount24hWindowStart: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    anonymizedAt: null,
  };
  contacts.contacts.set(CONTACT_ID, {
    ...c,
    briefsCount24h: 0,
    briefsCount24hWindowStart: null,
  });
  contacts.byEmail.set(EMAIL, CONTACT_ID);
  return c;
}

function seedBriefs(briefs: FakeVoyageurBriefStore, count: number): VoyageurBriefRecord[] {
  const out: VoyageurBriefRecord[] = [];
  for (let i = 0; i < count; i++) {
    const brief: VoyageurBriefRecord = {
      id: asBriefId(`33333333-3333-4333-8333-${String(i).padStart(12, '0')}`),
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
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    briefs.seed(brief);
    out.push(brief);
  }
  return out;
}

describe('EraseAllVoyageurDataUseCase — golden path', () => {
  it('cascade contact + 3 briefs → tous anonymized + outbox × 3', async () => {
    const { useCase, briefs, contacts, audit, outbox } = buildUseCase();
    seedContact(contacts);
    seedBriefs(briefs, 3);

    const r = await useCase.execute({
      contactId: CONTACT_ID,
      confirmation: VALID_PHRASE,
      acknowledgedBriefCount: 3,
    });
    expect(r.kind).toBe('ok');
    if (r.kind === 'ok') {
      expect(r.briefsAffectedCount).toBe(3);
    }

    // Contact PII nullified
    const contactAfter = contacts.contacts.get(CONTACT_ID);
    expect(contactAfter?.firstName).toBeNull();
    expect(contactAfter?.lastName).toBeNull();
    expect(contactAfter?.email).toBeNull();
    expect(contactAfter?.emailHashAfterErasure).toMatch(/^[0-9a-f]{64}$/);
    expect(contactAfter?.anonymizedAt).toEqual(NOW);

    // 3 briefs anonymized
    const allBriefs = Array.from(briefs.briefs.values());
    expect(allBriefs.every((b) => b.status === 'anonymized')).toBe(true);

    // Audit + outbox × 3 deletions
    expect(audit.entries.some((e) => e.eventType === 'intake.contact.erase_all_requested')).toBe(
      true,
    );
    expect(outbox.entries.filter((e) => e.eventType === 'voyageur.brief.deleted')).toHaveLength(3);
  });
});

describe('EraseAllVoyageurDataUseCase — refus', () => {
  it('refuse phrase incorrecte (FR-022 phrase ≠ FR-022a)', async () => {
    const { useCase, contacts, briefs } = buildUseCase();
    seedContact(contacts);
    seedBriefs(briefs, 2);
    const r = await useCase.execute({
      contactId: CONTACT_ID,
      confirmation: 'JE_CONFIRME_LA_SUPPRESSION_IRREVERSIBLE', // phrase FR-022
      acknowledgedBriefCount: 2,
    });
    expect(r.kind).toBe('invalid_confirmation');
  });

  it('refuse acknowledgedBriefCount stale (≠ actuel)', async () => {
    const { useCase, contacts, briefs } = buildUseCase();
    seedContact(contacts);
    seedBriefs(briefs, 3); // 3 réels
    const r = await useCase.execute({
      contactId: CONTACT_ID,
      confirmation: VALID_PHRASE,
      acknowledgedBriefCount: 2, // UI stale
    });
    expect(r.kind).toBe('stale_brief_count');
  });

  it('renvoie contact_not_found si contact inexistant', async () => {
    const { useCase } = buildUseCase();
    const r = await useCase.execute({
      contactId: CONTACT_ID,
      confirmation: VALID_PHRASE,
      acknowledgedBriefCount: 0,
    });
    expect(r.kind).toBe('contact_not_found');
  });

  it('renvoie already_deleted si contact déjà anonymisé (idempotence)', async () => {
    const { useCase, contacts } = buildUseCase();
    seedContact(contacts);
    const c = contacts.contacts.get(CONTACT_ID);
    if (c) {
      contacts.contacts.set(CONTACT_ID, {
        ...c,
        anonymizedAt: new Date('2026-05-10'),
      });
    }
    const r = await useCase.execute({
      contactId: CONTACT_ID,
      confirmation: VALID_PHRASE,
      acknowledgedBriefCount: 0,
    });
    expect(r.kind).toBe('already_deleted');
  });
});
