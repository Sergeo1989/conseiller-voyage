// T081b [TDD RED] — Tests ResendMagicLinkUseCase (N1).
//
// Réponse uniforme 'sent_or_email_not_found' (anti-énumération email).
// Si le contact existe et a un brief en pending_verification ou récemment
// actif (< 7j), on crée un nouveau MagicLinkToken et on enqueue le mailer.
// Sinon on renvoie quand même 'sent_or_email_not_found' (le caller ne
// distingue pas — pas de leak email).

import { describe, expect, it } from 'vitest';
import {
  FakeClock,
  FakeMagicLinkMailer,
  FakeMagicLinkTokenStore,
  FakeUuidGenerator,
  FakeVoyageurBriefStore,
  FakeVoyageurContactStore,
  asBriefId,
  asContactId,
} from '../../__tests__/_fakes';
import type { VoyageurBriefRecord, VoyageurContactRecord } from '../../ports';
import { ResendMagicLinkUseCase } from '../resend-magic-link.use-case';

const NOW = new Date('2026-05-15T10:00:00Z');
const BRIEF_ID = asBriefId('11111111-1111-4111-8111-111111111111');
const CONTACT_ID = asContactId('22222222-2222-4222-8222-222222222222');
const EMAIL = 'marie.dupont@gmail.com';

function buildUseCase() {
  const clock = new FakeClock(NOW);
  const uuid = new FakeUuidGenerator();
  const briefs = new FakeVoyageurBriefStore();
  const contacts = new FakeVoyageurContactStore();
  const tokens = new FakeMagicLinkTokenStore();
  const mailer = new FakeMagicLinkMailer();
  const useCase = new ResendMagicLinkUseCase({
    clock,
    uuid,
    briefReader: briefs,
    contactReader: contacts,
    tokenWriter: tokens,
    mailer,
    magicLinkTtlDays: 7,
  });
  return { useCase, briefs, contacts, tokens, mailer };
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

function seedPendingBrief(briefs: FakeVoyageurBriefStore): VoyageurBriefRecord {
  const brief: VoyageurBriefRecord = {
    id: BRIEF_ID,
    voyageurContactId: CONTACT_ID,
    status: 'pending_verification',
    submittedAt: new Date('2026-05-15T09:00:00Z'),
    verifiedAt: null,
    expiresAt: new Date('2026-08-13T09:00:00Z'),
    consentGivenAt: new Date('2026-05-15T09:00:00Z'),
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
  return brief;
}

describe('ResendMagicLinkUseCase', () => {
  it('renvoie sent_or_email_not_found en cas nominal + envoie mail + crée token', async () => {
    const { useCase, briefs, contacts, tokens, mailer } = buildUseCase();
    seedContact(contacts);
    seedPendingBrief(briefs);

    const r = await useCase.execute({ email: EMAIL, locale: 'fr-CA' });
    expect(r.kind).toBe('sent_or_email_not_found');
    expect(tokens.tokens.size).toBe(1);
    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0]?.toEmail).toBe(EMAIL);
  });

  it('renvoie sent_or_email_not_found si email inexistant (anti-énumération)', async () => {
    const { useCase, tokens, mailer } = buildUseCase();
    const r = await useCase.execute({ email: 'inconnu@example.com', locale: 'fr-CA' });
    expect(r.kind).toBe('sent_or_email_not_found');
    expect(tokens.tokens.size).toBe(0);
    expect(mailer.sent).toHaveLength(0);
  });

  it('renvoie sent_or_email_not_found si contact anonymisé (refus silencieux)', async () => {
    const { useCase, contacts, tokens, mailer } = buildUseCase();
    seedContact(contacts);
    const c = contacts.contacts.get(CONTACT_ID);
    if (c) {
      contacts.contacts.set(CONTACT_ID, { ...c, anonymizedAt: new Date('2026-01-01') });
    }
    const r = await useCase.execute({ email: EMAIL, locale: 'fr-CA' });
    expect(r.kind).toBe('sent_or_email_not_found');
    expect(tokens.tokens.size).toBe(0);
    expect(mailer.sent).toHaveLength(0);
  });

  it('renvoie sent_or_email_not_found si pas de brief pending_verification', async () => {
    const { useCase, contacts, tokens, mailer } = buildUseCase();
    seedContact(contacts);
    // pas de seedPendingBrief
    const r = await useCase.execute({ email: EMAIL, locale: 'fr-CA' });
    expect(r.kind).toBe('sent_or_email_not_found');
    expect(tokens.tokens.size).toBe(0);
    expect(mailer.sent).toHaveLength(0);
  });
});
