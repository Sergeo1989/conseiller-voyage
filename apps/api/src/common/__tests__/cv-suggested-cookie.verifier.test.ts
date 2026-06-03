// T070 (US2) — Tests verifyCvSuggestedCookie.

import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { verifyCvSuggestedCookie } from '../cv-suggested-cookie.verifier';

const SECRET = 'test-secret-32-bytes-minimum-please-yes';
const VALID_CONSEILLER_ID = '22222222-2222-4222-8222-000000000001';

function signCookie(conseillerId: string, secret: string): string {
  const hmac = createHmac('sha256', secret).update(conseillerId).digest('hex');
  return `${conseillerId}.${hmac}`;
}

describe('verifyCvSuggestedCookie', () => {
  it('cookie signé correctement → conseillerId retourné', () => {
    const cookie = signCookie(VALID_CONSEILLER_ID, SECRET);
    expect(verifyCvSuggestedCookie(cookie, SECRET)).toBe(VALID_CONSEILLER_ID);
  });

  it('cookie null → null', () => {
    expect(verifyCvSuggestedCookie(null, SECRET)).toBeNull();
  });

  it('cookie undefined → null', () => {
    expect(verifyCvSuggestedCookie(undefined, SECRET)).toBeNull();
  });

  it('cookie vide → null', () => {
    expect(verifyCvSuggestedCookie('', SECRET)).toBeNull();
  });

  it('cookie sans séparateur → null', () => {
    expect(verifyCvSuggestedCookie('just-a-uuid', SECRET)).toBeNull();
  });

  it('conseillerId non-UUID → null', () => {
    expect(verifyCvSuggestedCookie(signCookie('not-a-uuid', SECRET), SECRET)).toBeNull();
  });

  it('HMAC invalide (signé avec un autre secret) → null', () => {
    const otherCookie = signCookie(VALID_CONSEILLER_ID, 'other-secret-xxx-different-32-bytes-12');
    expect(verifyCvSuggestedCookie(otherCookie, SECRET)).toBeNull();
  });

  it('HMAC tronqué (longueur incorrecte) → null', () => {
    expect(verifyCvSuggestedCookie(`${VALID_CONSEILLER_ID}.abc123`, SECRET)).toBeNull();
  });

  it('HMAC modifié 1 caractère → null', () => {
    const validCookie = signCookie(VALID_CONSEILLER_ID, SECRET);
    const tampered = validCookie.slice(0, -1) + (validCookie.endsWith('a') ? 'b' : 'a');
    expect(verifyCvSuggestedCookie(tampered, SECRET)).toBeNull();
  });
});
