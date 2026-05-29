// Tests T034 — Transitions VoyageurBrief.
// Cf. data-model.md *Transitions de statut*.

import { asVoyageurBriefId, asVoyageurContactId } from '@cv/shared/intake';
import { describe, expect, it } from 'vitest';
import {
  type VoyageurBrief,
  isExpired,
  markAnonymized,
  markDeleted,
  markExpired,
  markVerified,
} from '../voyageur-brief.entity';

const ANY_UUID = '550e8400-e29b-41d4-a716-446655440000';
const ANOTHER_UUID = '7c9e6679-7425-40de-944b-e07fc1f90ae7';

function buildBrief(overrides: Partial<VoyageurBrief> = {}): VoyageurBrief {
  return {
    id: asVoyageurBriefId(ANY_UUID),
    voyageurContactId: asVoyageurContactId(ANOTHER_UUID),
    status: 'pending_verification',
    submittedAt: new Date('2026-05-01T10:00:00Z'),
    verifiedAt: null,
    expiresAt: new Date('2026-07-30T10:00:00Z'),
    consentGivenAt: new Date('2026-05-01T10:00:00Z'),
    erasureRequestedAt: null,
    anonymizedAt: null,
    destinations: [{ country: 'IT' }],
    departureDate: new Date('2027-03-15'),
    returnDate: new Date('2027-03-30'),
    datesFlexible: true,
    datesFlexibilityDays: 5,
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
    ...overrides,
  };
}

describe('markVerified', () => {
  it('transitions pending_verification → active + set verifiedAt', () => {
    const before = buildBrief({ status: 'pending_verification' });
    const verifiedAt = new Date('2026-05-01T10:30:00Z');
    const after = markVerified(before, verifiedAt);
    expect(after.status).toBe('active');
    expect(after.verifiedAt).toEqual(verifiedAt);
  });

  it('refuse si statut n est pas pending_verification', () => {
    const active = buildBrief({ status: 'active' });
    expect(() => markVerified(active, new Date())).toThrow();
  });
});

describe('markExpired', () => {
  it('accepte status=active', () => {
    expect(markExpired(buildBrief({ status: 'active' })).status).toBe('expired');
  });

  it('accepte status=matched', () => {
    expect(markExpired(buildBrief({ status: 'matched' })).status).toBe('expired');
  });

  it('refuse status=pending_verification', () => {
    expect(() => markExpired(buildBrief({ status: 'pending_verification' }))).toThrow();
  });
});

describe('markDeleted', () => {
  it('transitions → deleted + set erasureRequestedAt', () => {
    const before = buildBrief({ status: 'active' });
    const now = new Date('2026-05-15T12:00:00Z');
    const after = markDeleted(before, now);
    expect(after.status).toBe('deleted');
    expect(after.erasureRequestedAt).toEqual(now);
  });

  it('refuse si déjà anonymisé', () => {
    expect(() => markDeleted(buildBrief({ status: 'anonymized' }), new Date())).toThrow();
  });
});

describe('markAnonymized', () => {
  it('transitions vers anonymized', () => {
    const after = markAnonymized(buildBrief({ status: 'deleted' }), new Date());
    expect(after.status).toBe('anonymized');
    expect(after.anonymizedAt).not.toBeNull();
  });

  it('est idempotent si déjà anonymisé', () => {
    const already = buildBrief({ status: 'anonymized', anonymizedAt: new Date('2026-01-01') });
    const after = markAnonymized(already, new Date('2026-05-01'));
    expect(after.anonymizedAt).toEqual(already.anonymizedAt);
  });
});

describe('isExpired', () => {
  it('vrai si now ≥ expiresAt', () => {
    const brief = buildBrief({ expiresAt: new Date('2026-07-30T10:00:00Z') });
    expect(isExpired(brief, new Date('2026-07-30T10:00:01Z'))).toBe(true);
  });

  it('faux si now < expiresAt', () => {
    const brief = buildBrief({ expiresAt: new Date('2026-07-30T10:00:00Z') });
    expect(isExpired(brief, new Date('2026-07-29T23:59:59Z'))).toBe(false);
  });
});
