// T021 — Tests Vitest shouldSuppress.

import { describe, expect, test } from 'vitest';
import { type SuppressionListEntryView, shouldSuppress } from '../should-suppress';

const NOW = new Date('2026-05-28T12:00:00.000Z');

function entry(overrides: Partial<SuppressionListEntryView> = {}): SuppressionListEntryView {
  return {
    recipientEmailHashHMAC: 'a'.repeat(64),
    reason: 'hard_bounce',
    addedAt: new Date('2026-05-01T00:00:00.000Z'),
    expiresAt: null,
    removedAt: null,
    ...overrides,
  };
}

describe('shouldSuppress — feature 003', () => {
  test('null → ne supprime pas', () => {
    expect(shouldSuppress(null, NOW)).toEqual({ suppress: false });
  });

  test('hard_bounce permanent (expiresAt=null) → supprime', () => {
    expect(shouldSuppress(entry({ reason: 'hard_bounce' }), NOW)).toEqual({
      suppress: true,
      reason: 'hard_bounce',
    });
  });

  test('complaint permanent → supprime', () => {
    expect(shouldSuppress(entry({ reason: 'complaint' }), NOW)).toEqual({
      suppress: true,
      reason: 'complaint',
    });
  });

  test('manual (admin ajouté) → supprime', () => {
    expect(shouldSuppress(entry({ reason: 'manual' }), NOW)).toEqual({
      suppress: true,
      reason: 'manual',
    });
  });

  test('soft_bounce_repeated avec expiresAt futur → supprime', () => {
    const futureExpiry = new Date(NOW.getTime() + 24 * 60 * 60 * 1000);
    expect(
      shouldSuppress(entry({ reason: 'soft_bounce_repeated', expiresAt: futureExpiry }), NOW),
    ).toEqual({ suppress: true, reason: 'soft_bounce_repeated' });
  });

  test('soft_bounce_repeated avec expiresAt passé → NE supprime PAS', () => {
    const pastExpiry = new Date(NOW.getTime() - 1);
    expect(
      shouldSuppress(entry({ reason: 'soft_bounce_repeated', expiresAt: pastExpiry }), NOW),
    ).toEqual({ suppress: false });
  });

  test('soft_bounce_repeated avec expiresAt exactement now → NE supprime PAS', () => {
    // Frontière : si expiresAt === now, l'entry est techniquement
    // expirée (la spec dit "expire après 30j").
    expect(shouldSuppress(entry({ reason: 'soft_bounce_repeated', expiresAt: NOW }), NOW)).toEqual({
      suppress: false,
    });
  });

  test('removedAt non-null (admin a retiré) → NE supprime PAS', () => {
    expect(
      shouldSuppress(
        entry({
          reason: 'hard_bounce',
          removedAt: new Date(NOW.getTime() - 60_000),
        }),
        NOW,
      ),
    ).toEqual({ suppress: false });
  });

  test('removedAt non-null bat expiresAt futur (admin override)', () => {
    const futureExpiry = new Date(NOW.getTime() + 24 * 60 * 60 * 1000);
    expect(
      shouldSuppress(
        entry({
          reason: 'soft_bounce_repeated',
          expiresAt: futureExpiry,
          removedAt: new Date(NOW.getTime() - 60_000),
        }),
        NOW,
      ),
    ).toEqual({ suppress: false });
  });
});
