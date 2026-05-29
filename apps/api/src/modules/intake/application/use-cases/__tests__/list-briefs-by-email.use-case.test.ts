// T080 [TDD RED] — Tests ListBriefsByEmailUseCase.
// FR-017 : voyageur consulte la liste de ses briefs actifs.

import { describe, expect, it } from 'vitest';
import {
  FakeVoyageurBriefStore,
  FakeVoyageurContactStore,
  asBriefId,
  asContactId,
} from '../../__tests__/_fakes';
import type { VoyageurBriefRecord, VoyageurContactRecord } from '../../ports';
import { ListBriefsByEmailUseCase } from '../list-briefs-by-email.use-case';

const CONTACT_ID = asContactId('22222222-2222-4222-8222-222222222222');
const EMAIL = 'marie.dupont@gmail.com';

function buildUseCase() {
  const briefs = new FakeVoyageurBriefStore();
  const contacts = new FakeVoyageurContactStore();
  const useCase = new ListBriefsByEmailUseCase({
    briefReader: briefs,
    contactReader: contacts,
  });
  return { useCase, briefs, contacts };
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

function seedBrief(
  briefs: FakeVoyageurBriefStore,
  overrides: Partial<VoyageurBriefRecord>,
): VoyageurBriefRecord {
  const brief: VoyageurBriefRecord = {
    id: asBriefId(`33333333-3333-4333-8333-${String(briefs.briefs.size).padStart(12, '0')}`),
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
    ...overrides,
  };
  briefs.seed(brief);
  return brief;
}

describe('ListBriefsByEmailUseCase', () => {
  it('liste les briefs actifs du contact', async () => {
    const { useCase, briefs, contacts } = buildUseCase();
    seedContact(contacts);
    seedBrief(briefs, {});
    seedBrief(briefs, { departureDate: new Date('2027-06-01') });

    const r = await useCase.execute({ contactId: CONTACT_ID });
    expect(r.kind).toBe('ok');
    if (r.kind === 'ok') {
      expect(r.briefs).toHaveLength(2);
      expect(r.briefs.every((b) => b.status === 'active')).toBe(true);
    }
  });

  it('exclut les briefs en pending_verification', async () => {
    const { useCase, briefs, contacts } = buildUseCase();
    seedContact(contacts);
    seedBrief(briefs, { status: 'active' });
    seedBrief(briefs, { status: 'pending_verification' });

    const r = await useCase.execute({ contactId: CONTACT_ID });
    expect(r.kind).toBe('ok');
    if (r.kind === 'ok') {
      expect(r.briefs).toHaveLength(1);
    }
  });

  it('renvoie contact_not_found si contactId inexistant', async () => {
    const { useCase } = buildUseCase();
    const r = await useCase.execute({ contactId: CONTACT_ID });
    expect(r.kind).toBe('contact_not_found');
  });

  it('renvoie contact_anonymised si contact.anonymizedAt set', async () => {
    const { useCase, contacts } = buildUseCase();
    seedContact(contacts);
    const c = contacts.contacts.get(CONTACT_ID);
    if (c) {
      contacts.contacts.set(CONTACT_ID, { ...c, anonymizedAt: new Date() });
    }
    const r = await useCase.execute({ contactId: CONTACT_ID });
    expect(r.kind).toBe('contact_anonymised');
  });

  it('renvoie tableau vide si aucun brief actif', async () => {
    const { useCase, contacts } = buildUseCase();
    seedContact(contacts);
    const r = await useCase.execute({ contactId: CONTACT_ID });
    expect(r.kind).toBe('ok');
    if (r.kind === 'ok') expect(r.briefs).toHaveLength(0);
  });
});
