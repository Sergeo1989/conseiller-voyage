// T021 — Tests TDD RED pour packages/mfa/src/freshness.ts.
// FR-016 : session "MFA frais" pendant 30 minutes après dernière
// validation TOTP. Limite stricte >= 30 min = non fresh (P2-6).

import { describe, expect, it } from 'vitest';
import { DEFAULT_FRESHNESS_WINDOW_MIN, isFresh } from '../freshness';

describe('freshness', () => {
  const NOW = new Date('2026-05-25T12:00:00Z');

  it('mfaVerifiedAt = null → non fresh', () => {
    expect(isFresh(null, NOW)).toBe(false);
  });

  it('mfaVerifiedAt = T-0 → fresh', () => {
    expect(isFresh(NOW, NOW)).toBe(true);
  });

  it('mfaVerifiedAt = T-29:59 → fresh (juste sous la limite)', () => {
    const past = new Date(NOW.getTime() - (29 * 60 + 59) * 1000);
    expect(isFresh(past, NOW)).toBe(true);
  });

  it('mfaVerifiedAt = T-30:00 EXACTEMENT → non fresh (limite inclusive — P2-6)', () => {
    const past = new Date(NOW.getTime() - 30 * 60 * 1000);
    expect(isFresh(past, NOW)).toBe(false);
  });

  it('mfaVerifiedAt = T-30:01 → non fresh', () => {
    const past = new Date(NOW.getTime() - (30 * 60 + 1) * 1000);
    expect(isFresh(past, NOW)).toBe(false);
  });

  it('mfaVerifiedAt dans le futur (drift d horloge) → fresh', () => {
    const future = new Date(NOW.getTime() + 60 * 1000);
    expect(isFresh(future, NOW)).toBe(true);
  });

  it('windowMin custom respecté (5 min)', () => {
    const past5min = new Date(NOW.getTime() - 5 * 60 * 1000);
    const past6min = new Date(NOW.getTime() - 6 * 60 * 1000);
    expect(isFresh(past5min, NOW, 5)).toBe(false); // limite stricte
    expect(isFresh(past6min, NOW, 10)).toBe(true);
  });

  it('DEFAULT_FRESHNESS_WINDOW_MIN = 30', () => {
    expect(DEFAULT_FRESHNESS_WINDOW_MIN).toBe(30);
  });
});
