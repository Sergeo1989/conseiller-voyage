// T022 — Tests TDD RED pour encode/decode du cookie cv_suggested (Principe VI).
//
// HMAC SHA-256 + base64url + FIFO ≤ 10. Tampering détecté, replay 24h filtré
// au niveau du caller (cf. fenetreValiditeSuggested).

import { describe, expect, it } from 'vitest';
import {
  type SuggestedCookiePayload,
  appendEntry,
  decodeSuggestedCookie,
  encodeSuggestedCookie,
} from '../src/suggested-cookie';

const SECRET = 'a'.repeat(32);
const SECRET_BIS = 'b'.repeat(32);

describe('encode / decode round-trip', () => {
  it('round-trip simple : encode puis decode produit le même payload', () => {
    const payload: SuggestedCookiePayload = {
      v: 1,
      entries: [{ cid: '55555555-5555-5555-5555-555555555555', ts: 1748530200000 }],
    };
    const encoded = encodeSuggestedCookie(payload, SECRET);
    const decoded = decodeSuggestedCookie(encoded, SECRET);
    expect(decoded).toEqual(payload.entries);
  });

  it("round-trip avec plusieurs entrées préserve l'ordre", () => {
    const payload: SuggestedCookiePayload = {
      v: 1,
      entries: [
        { cid: '11111111-1111-1111-1111-111111111111', ts: 1748530200000 },
        { cid: '22222222-2222-2222-2222-222222222222', ts: 1748530200001 },
        { cid: '33333333-3333-3333-3333-333333333333', ts: 1748530200002 },
      ],
    };
    const encoded = encodeSuggestedCookie(payload, SECRET);
    const decoded = decodeSuggestedCookie(encoded, SECRET);
    expect(decoded).toEqual(payload.entries);
  });
});

describe('détection de tampering', () => {
  it('retourne null si signature HMAC invalide', () => {
    const payload: SuggestedCookiePayload = {
      v: 1,
      entries: [{ cid: '55555555-5555-5555-5555-555555555555', ts: 1748530200000 }],
    };
    const encoded = encodeSuggestedCookie(payload, SECRET);
    // Tamper : retire le dernier caractère de la signature
    const tampered = encoded.slice(0, -1);
    expect(decodeSuggestedCookie(tampered, SECRET)).toBe(null);
  });

  it('retourne null si on tamper le payload (signature ne matche plus)', () => {
    const payload: SuggestedCookiePayload = {
      v: 1,
      entries: [{ cid: '55555555-5555-5555-5555-555555555555', ts: 1748530200000 }],
    };
    const encoded = encodeSuggestedCookie(payload, SECRET);
    // Tamper : modifie le premier caractère du payload
    const tampered = `X${encoded.slice(1)}`;
    expect(decodeSuggestedCookie(tampered, SECRET)).toBe(null);
  });

  it('retourne null si décodé avec un secret différent (rotation cassée)', () => {
    const payload: SuggestedCookiePayload = {
      v: 1,
      entries: [{ cid: '55555555-5555-5555-5555-555555555555', ts: 1748530200000 }],
    };
    const encoded = encodeSuggestedCookie(payload, SECRET);
    expect(decodeSuggestedCookie(encoded, SECRET_BIS)).toBe(null);
  });

  it('retourne null pour une chaîne malformée (pas de point séparateur)', () => {
    expect(decodeSuggestedCookie('not-a-valid-cookie-value', SECRET)).toBe(null);
  });

  it('retourne null pour chaîne vide', () => {
    expect(decodeSuggestedCookie('', SECRET)).toBe(null);
  });

  it('retourne null pour version inconnue (v: 2)', () => {
    // Si version future incompatible, retourner null = traité comme absent.
    // On fabrique un cookie v=2 manuellement.
    const futurePayload = { v: 2, entries: [] };
    const encoded = encodeSuggestedCookie(futurePayload as SuggestedCookiePayload, SECRET);
    expect(decodeSuggestedCookie(encoded, SECRET)).toBe(null);
  });
});

describe('appendEntry (FIFO ≤ 10 + dédoublonnage)', () => {
  it('ajoute une entrée à une liste vide', () => {
    const result = appendEntry([], '55555555-5555-5555-5555-555555555555', 1748530200000);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ cid: '55555555-5555-5555-5555-555555555555', ts: 1748530200000 });
  });

  it('ajoute une entrée à la fin (FIFO)', () => {
    const existing = [{ cid: '11111111-1111-1111-1111-111111111111', ts: 1000 }];
    const result = appendEntry(existing, '22222222-2222-2222-2222-222222222222', 2000);
    expect(result).toHaveLength(2);
    expect(result[1]).toEqual({ cid: '22222222-2222-2222-2222-222222222222', ts: 2000 });
  });

  it('dédoublonne : ajouter un cid déjà présent → déplace en queue avec nouveau ts', () => {
    const existing = [
      { cid: '11111111-1111-1111-1111-111111111111', ts: 1000 },
      { cid: '22222222-2222-2222-2222-222222222222', ts: 2000 },
    ];
    const result = appendEntry(existing, '11111111-1111-1111-1111-111111111111', 3000);
    expect(result).toHaveLength(2);
    // L'ancienne entrée 1111 est retirée et la nouvelle est en queue
    expect(result[0]).toEqual({ cid: '22222222-2222-2222-2222-222222222222', ts: 2000 });
    expect(result[1]).toEqual({ cid: '11111111-1111-1111-1111-111111111111', ts: 3000 });
  });

  it('plafonne à 10 entrées (FIFO : éviction de la plus ancienne)', () => {
    const existing = Array.from({ length: 10 }, (_, i) => ({
      cid: `${'0'.repeat(8 - String(i).length)}${i}-0000-0000-0000-000000000000` as string,
      ts: 1000 + i,
    }));
    const result = appendEntry(existing, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 9999);
    expect(result).toHaveLength(10);
    expect(result[result.length - 1]).toEqual({
      cid: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      ts: 9999,
    });
    // La plus ancienne (ts=1000) doit avoir été éjectée
    expect(result.find((e) => e.ts === 1000)).toBeUndefined();
  });
});
