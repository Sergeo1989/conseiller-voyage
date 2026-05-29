// T040 [TDD RED] — Tests computeBriefExpiration.
// FR-024 : J+90 jours après submittedAt. Pure (stable / déterministe).

import { describe, expect, it } from 'vitest';
import { computeBriefExpiration } from '../compute-brief-expiration';

describe('computeBriefExpiration', () => {
  it('ajoute exactement 90 jours par défaut', () => {
    const submittedAt = new Date('2026-05-01T10:00:00Z');
    const expected = new Date('2026-07-30T10:00:00Z'); // +90j calendaires
    expect(computeBriefExpiration({ submittedAt }).getTime()).toBe(expected.getTime());
  });

  it('respecte les fuseaux horaires UTC', () => {
    const submittedAt = new Date('2026-05-01T23:59:59Z');
    const result = computeBriefExpiration({ submittedAt });
    expect(result.toISOString()).toBe('2026-07-30T23:59:59.000Z');
  });

  it('accepte un override de durée (pour tests)', () => {
    const submittedAt = new Date('2026-05-01T10:00:00Z');
    const expected = new Date('2026-05-08T10:00:00Z'); // +7j
    expect(computeBriefExpiration({ submittedAt, expirationDays: 7 }).getTime()).toBe(
      expected.getTime(),
    );
  });

  it('refuse expirationDays négatif', () => {
    expect(() => computeBriefExpiration({ submittedAt: new Date(), expirationDays: -1 })).toThrow();
  });

  it('refuse expirationDays = 0', () => {
    expect(() => computeBriefExpiration({ submittedAt: new Date(), expirationDays: 0 })).toThrow();
  });

  it('refuse expirationDays non-entier', () => {
    expect(() =>
      computeBriefExpiration({ submittedAt: new Date(), expirationDays: 90.5 }),
    ).toThrow();
  });
});
