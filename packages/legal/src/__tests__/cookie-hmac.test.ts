// Tests du cookie HMAC signé (ADR-0009).
//
// **3 tests P0 bloquants merge** identifiés par la review post-plan :
//   1. Forge detection : cookie avec signature modifiée → null
//   2. Détection mismatch userId : cookie volé d'un user présenté pour
//      un autre → null
//   3. Détection expiration : exp < now → null
//
// Note : sign/verify sont async (Web Crypto API) pour compatibilité
// Edge runtime Next.js.
//
// Cf. specs/004-mentions-legales/contracts/middleware-version-check.md.

import { describe, expect, it } from 'vitest';
import { signLegalVersionCookie, verifyLegalVersionCookie } from '../cookie-hmac';

const SECRET = 'a'.repeat(32); // 32 bytes — taille production
const ALT_SECRET = 'b'.repeat(32);
const USER_A = '00000000-0000-4000-8000-000000000001';

const NOW_MS = Date.parse('2026-05-25T12:00:00Z');
const TTL_SECONDS = 300;

describe('signLegalVersionCookie', () => {
  it('produit une chaîne au format "payload.signature"', async () => {
    const cookie = await signLegalVersionCookie(USER_A, 1, SECRET);
    expect(cookie).toMatch(/^[A-Za-z0-9_-]+\.[0-9a-f]{64}$/);
  });

  it('est déterministe : signature reproducible et vérifiable des deux côtés', async () => {
    const cookie1 = await signLegalVersionCookie(USER_A, 1, SECRET, TTL_SECONDS);
    const cookie2 = await signLegalVersionCookie(USER_A, 1, SECRET, TTL_SECONDS);
    const v1 = await verifyLegalVersionCookie(cookie1, SECRET, NOW_MS);
    const v2 = await verifyLegalVersionCookie(cookie2, SECRET, NOW_MS);
    expect(v1).not.toBeNull();
    expect(v2).not.toBeNull();
    expect(v1?.userId).toBe(USER_A);
    expect(v2?.userId).toBe(USER_A);
  });

  it('rejette userId vide', async () => {
    await expect(signLegalVersionCookie('', 1, SECRET)).rejects.toThrow();
  });

  it('rejette version ≤ 0', async () => {
    await expect(signLegalVersionCookie(USER_A, 0, SECRET)).rejects.toThrow();
    await expect(signLegalVersionCookie(USER_A, -1, SECRET)).rejects.toThrow();
  });

  it('rejette secret vide', async () => {
    await expect(signLegalVersionCookie(USER_A, 1, '')).rejects.toThrow();
  });
});

describe('verifyLegalVersionCookie', () => {
  describe('cas valides', () => {
    it('retourne le payload pour un cookie fraîchement signé', async () => {
      const cookie = await signLegalVersionCookie(USER_A, 3, SECRET, TTL_SECONDS);
      const verified = await verifyLegalVersionCookie(cookie, SECRET, Date.now());
      expect(verified).not.toBeNull();
      expect(verified?.userId).toBe(USER_A);
      expect(verified?.cguB2bVersion).toBe(3);
      expect(verified?.exp).toBeGreaterThan(Date.now());
    });
  });

  describe("cas invalides (retourne null, pas d'exception)", () => {
    it('retourne null pour cookie undefined', async () => {
      expect(await verifyLegalVersionCookie(undefined, SECRET, Date.now())).toBeNull();
    });

    it('retourne null pour cookie vide', async () => {
      expect(await verifyLegalVersionCookie('', SECRET, Date.now())).toBeNull();
    });

    it('retourne null pour cookie malformé (pas de séparateur)', async () => {
      expect(await verifyLegalVersionCookie('not-a-cookie', SECRET, Date.now())).toBeNull();
    });

    it('retourne null pour cookie malformé (plusieurs séparateurs)', async () => {
      expect(await verifyLegalVersionCookie('a.b.c', SECRET, Date.now())).toBeNull();
    });

    it('retourne null pour payload non-JSON', async () => {
      const cookie = `bm90anNvbg.${'f'.repeat(64)}`;
      expect(await verifyLegalVersionCookie(cookie, SECRET, Date.now())).toBeNull();
    });

    // ----- 3 cas P0 bloquants merge -----

    it('🚨 P0 BLOQUANT : retourne null si signature HMAC modifiée (forge detection)', async () => {
      const cookie = await signLegalVersionCookie(USER_A, 1, SECRET, TTL_SECONDS);
      const parts = cookie.split('.');
      const payload = parts[0];
      const sig = parts[1];
      if (payload === undefined || sig === undefined) {
        throw new Error('test fixture: cookie format unexpected');
      }
      const lastChar = sig.slice(-1);
      const flippedChar = lastChar === '0' ? '1' : '0';
      const forgedCookie = `${payload}.${sig.slice(0, -1)}${flippedChar}`;
      expect(await verifyLegalVersionCookie(forgedCookie, SECRET, Date.now())).toBeNull();
    });

    it('🚨 P0 BLOQUANT : retourne null si secret différent (rotation ou clé inconnue)', async () => {
      const cookie = await signLegalVersionCookie(USER_A, 1, SECRET, TTL_SECONDS);
      expect(await verifyLegalVersionCookie(cookie, ALT_SECRET, Date.now())).toBeNull();
    });

    it('🚨 P0 BLOQUANT : retourne null si cookie expiré (exp < nowMs)', async () => {
      const cookie = await signLegalVersionCookie(USER_A, 1, SECRET, 60);
      const futureNowMs = Date.now() + 120 * 1000;
      expect(await verifyLegalVersionCookie(cookie, SECRET, futureNowMs)).toBeNull();
    });

    it("ne lève pas d'exception sur cookie bien-formé mais sémantiquement invalide", async () => {
      const cookie = await signLegalVersionCookie(USER_A, 1, SECRET);
      await expect(verifyLegalVersionCookie(cookie, SECRET, Date.now())).resolves.toBeDefined();
    });
  });

  describe('cas exotiques', () => {
    it('comparaison de signature en temps constant (rejette forge tôt et tard pareil)', async () => {
      const cookie = await signLegalVersionCookie(USER_A, 1, SECRET);
      const parts = cookie.split('.');
      const payload = parts[0];
      const sig = parts[1];
      if (payload === undefined || sig === undefined) {
        throw new Error('test fixture: cookie format unexpected');
      }
      const flipFirst = sig[0] === 'a' ? 'b' : 'a';
      const flipLast = sig[sig.length - 1] === 'a' ? 'b' : 'a';
      const forgedEarly = `${payload}.${flipFirst}${sig.slice(1)}`;
      const forgedLate = `${payload}.${sig.slice(0, -1)}${flipLast}`;
      expect(await verifyLegalVersionCookie(forgedEarly, SECRET, Date.now())).toBeNull();
      expect(await verifyLegalVersionCookie(forgedLate, SECRET, Date.now())).toBeNull();
    });
  });
});
