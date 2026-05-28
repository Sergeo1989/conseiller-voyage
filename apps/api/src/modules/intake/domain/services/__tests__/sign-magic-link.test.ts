// T038 [TDD RED] — Tests signMagicLink (HMAC SHA-256).
// R1 + ADR-0018 : le token clair lui-même est random (32 bytes hex)
// stocké côté DB en SHA-256(clear). signMagicLink produit la SIGNATURE
// du tuple (briefId, expiresAtUnix, clearToken) pour empêcher la
// falsification de l'URL côté client (le serveur peut détecter une URL
// modifiée même si le tokenHash existe en DB pour un autre brief).

import { describe, expect, it } from 'vitest';
import { signMagicLink, verifyMagicLinkSignature } from '../sign-magic-link';

const SECRET = 'a'.repeat(32);
const SAMPLE = {
  briefId: '550e8400-e29b-41d4-a716-446655440000',
  expiresAtUnix: 1_750_000_000,
  clearToken: 'b'.repeat(64),
};

describe('signMagicLink', () => {
  it('produit une signature hex 64 chars (HMAC SHA-256)', () => {
    const sig = signMagicLink({ ...SAMPLE, secret: SECRET });
    expect(sig).toMatch(/^[0-9a-f]{64}$/);
  });

  it('est déterministe (même input + secret → même output)', () => {
    const a = signMagicLink({ ...SAMPLE, secret: SECRET });
    const b = signMagicLink({ ...SAMPLE, secret: SECRET });
    expect(a).toBe(b);
  });

  it('change si le secret change', () => {
    const a = signMagicLink({ ...SAMPLE, secret: SECRET });
    const b = signMagicLink({ ...SAMPLE, secret: 'c'.repeat(32) });
    expect(a).not.toBe(b);
  });

  it('change si le briefId change', () => {
    const a = signMagicLink({ ...SAMPLE, secret: SECRET });
    const b = signMagicLink({
      ...SAMPLE,
      briefId: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
      secret: SECRET,
    });
    expect(a).not.toBe(b);
  });

  it('change si le clearToken change', () => {
    const a = signMagicLink({ ...SAMPLE, secret: SECRET });
    const b = signMagicLink({ ...SAMPLE, clearToken: 'c'.repeat(64), secret: SECRET });
    expect(a).not.toBe(b);
  });

  it('change si expiresAtUnix change', () => {
    const a = signMagicLink({ ...SAMPLE, secret: SECRET });
    const b = signMagicLink({ ...SAMPLE, expiresAtUnix: 1_750_000_001, secret: SECRET });
    expect(a).not.toBe(b);
  });
});

describe('verifyMagicLinkSignature', () => {
  it('renvoie true si la signature correspond', () => {
    const sig = signMagicLink({ ...SAMPLE, secret: SECRET });
    expect(verifyMagicLinkSignature({ ...SAMPLE, signature: sig, secret: SECRET })).toBe(true);
  });

  it('renvoie false si la signature est falsifiée', () => {
    expect(verifyMagicLinkSignature({ ...SAMPLE, signature: 'f'.repeat(64), secret: SECRET })).toBe(
      false,
    );
  });

  it('renvoie false si le briefId est modifié', () => {
    const sig = signMagicLink({ ...SAMPLE, secret: SECRET });
    expect(
      verifyMagicLinkSignature({
        ...SAMPLE,
        briefId: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
        signature: sig,
        secret: SECRET,
      }),
    ).toBe(false);
  });

  it('renvoie false si la signature n a pas la bonne longueur', () => {
    expect(verifyMagicLinkSignature({ ...SAMPLE, signature: 'abc', secret: SECRET })).toBe(false);
  });
});
