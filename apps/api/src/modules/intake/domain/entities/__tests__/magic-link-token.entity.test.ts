// Tests T036 — MagicLinkToken (génération, hashing, transitions).

import { createHash } from 'node:crypto';
import { asMagicLinkTokenId, asVoyageurBriefId } from '@cv/shared/intake';
import { describe, expect, it } from 'vitest';
import {
  type MagicLinkToken,
  generateClearToken,
  hashToken,
  isConsumed,
  isExpired,
  markConsumed,
  tokenHashMatches,
} from '../magic-link-token.entity';

const ANY_UUID = '550e8400-e29b-41d4-a716-446655440000';
const ANOTHER_UUID = '7c9e6679-7425-40de-944b-e07fc1f90ae7';

function buildToken(overrides: Partial<MagicLinkToken> = {}): MagicLinkToken {
  return {
    id: asMagicLinkTokenId(ANY_UUID),
    briefId: asVoyageurBriefId(ANOTHER_UUID),
    tokenHash: 'a'.repeat(64),
    purpose: 'verify_email',
    expiresAt: new Date('2026-06-08T10:00:00Z'),
    consumedAt: null,
    ...overrides,
  };
}

describe('generateClearToken', () => {
  it('génère 64 chars hex (32 bytes random)', () => {
    const token = generateClearToken();
    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  it('génère des tokens différents à chaque appel', () => {
    expect(generateClearToken()).not.toBe(generateClearToken());
  });
});

describe('hashToken', () => {
  it('produit un SHA-256 hex 64 chars', () => {
    const clear = 'abc';
    const hash = hashToken(clear);
    expect(hash).toBe(createHash('sha256').update('abc').digest('hex'));
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('tokenHashMatches (timing-safe)', () => {
  it('vrai pour deux hash égaux', () => {
    const h = hashToken('claim');
    expect(tokenHashMatches(h, h)).toBe(true);
  });

  it('faux pour deux hash différents', () => {
    expect(tokenHashMatches(hashToken('a'), hashToken('b'))).toBe(false);
  });

  it('faux pour longueurs différentes', () => {
    expect(tokenHashMatches('a'.repeat(64), 'a'.repeat(62))).toBe(false);
  });
});

describe('isExpired', () => {
  it('vrai si now ≥ expiresAt', () => {
    const token = buildToken({ expiresAt: new Date('2026-06-08T10:00:00Z') });
    expect(isExpired(token, new Date('2026-06-08T10:00:01Z'))).toBe(true);
  });
});

describe('isConsumed', () => {
  it('vrai si consumedAt non-null', () => {
    expect(isConsumed(buildToken({ consumedAt: new Date() }))).toBe(true);
  });
});

describe('markConsumed', () => {
  it('passe consumedAt à now', () => {
    const now = new Date('2026-06-01T12:00:00Z');
    expect(markConsumed(buildToken(), now).consumedAt).toEqual(now);
  });

  it('est idempotent si déjà consommé', () => {
    const t = buildToken({ consumedAt: new Date('2026-01-01') });
    expect(markConsumed(t, new Date('2026-05-01')).consumedAt).toEqual(t.consumedAt);
  });
});
