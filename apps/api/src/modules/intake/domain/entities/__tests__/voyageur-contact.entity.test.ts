// Tests T035 — applyAnonymisation VoyageurContact.

import { createHash } from 'node:crypto';
import { asVoyageurContactId } from '@cv/shared/intake';
import { describe, expect, it } from 'vitest';
import { type VoyageurContact, applyAnonymisation, isAnonymised } from '../voyageur-contact.entity';

const ANY_UUID = '550e8400-e29b-41d4-a716-446655440000';

function buildContact(overrides: Partial<VoyageurContact> = {}): VoyageurContact {
  return {
    id: asVoyageurContactId(ANY_UUID),
    email: 'marie.dupont@gmail.com',
    emailHashAfterErasure: null,
    firstName: 'Marie',
    lastName: 'Dupont',
    phone: '+15145551234',
    postalCode: 'H7N 1A1',
    briefsCount24h: 1,
    briefsCount24hWindowStart: new Date('2026-05-01T10:00:00Z'),
    anonymizedAt: null,
    ...overrides,
  };
}

describe('applyAnonymisation', () => {
  it('nullify les 5 PII + set emailHashAfterErasure SHA-256', () => {
    const before = buildContact();
    const now = new Date('2026-05-15T12:00:00Z');
    const after = applyAnonymisation(before, now);

    expect(after.firstName).toBeNull();
    expect(after.lastName).toBeNull();
    expect(after.phone).toBeNull();
    expect(after.postalCode).toBeNull();
    expect(after.email).toBeNull();
    expect(after.anonymizedAt).toEqual(now);

    const expectedHash = createHash('sha256').update('marie.dupont@gmail.com').digest('hex');
    expect(after.emailHashAfterErasure).toBe(expectedHash);
  });

  it('est idempotent si déjà anonymisé', () => {
    const already = buildContact({
      email: null,
      firstName: null,
      lastName: null,
      phone: null,
      postalCode: null,
      emailHashAfterErasure: 'existing-hash',
      anonymizedAt: new Date('2026-01-01'),
    });
    const after = applyAnonymisation(already, new Date('2026-05-01'));
    expect(after).toBe(already); // identité préservée
  });

  it('lowercase l email avant hash', () => {
    const before = buildContact({ email: 'Marie.DUPONT@Gmail.com' });
    const after = applyAnonymisation(before, new Date());
    const expected = createHash('sha256').update('marie.dupont@gmail.com').digest('hex');
    expect(after.emailHashAfterErasure).toBe(expected);
  });
});

describe('isAnonymised', () => {
  it('vrai si anonymizedAt set', () => {
    expect(isAnonymised(buildContact({ anonymizedAt: new Date() }))).toBe(true);
  });
  it('faux si anonymizedAt null', () => {
    expect(isAnonymised(buildContact({ anonymizedAt: null }))).toBe(false);
  });
});
