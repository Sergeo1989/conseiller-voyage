// T019 — tests RED de normalizeAuthError (R5 anti-énumération).

import { describe, expect, it } from 'vitest';
import { normalizeAuthError } from '../src/auth-error-normalizer';

describe('normalizeAuthError', () => {
  it('masque USER_NOT_FOUND comme INVALID_CREDENTIALS', () => {
    expect(normalizeAuthError('USER_NOT_FOUND')).toBe('INVALID_CREDENTIALS');
  });

  it('masque INVALID_PASSWORD comme INVALID_CREDENTIALS', () => {
    expect(normalizeAuthError('INVALID_PASSWORD')).toBe('INVALID_CREDENTIALS');
  });

  it('masque ACCOUNT_DISABLED comme INVALID_CREDENTIALS', () => {
    expect(normalizeAuthError('ACCOUNT_DISABLED')).toBe('INVALID_CREDENTIALS');
  });

  it('masque EMAIL_NOT_VERIFIED comme INVALID_CREDENTIALS', () => {
    // NB : la spec laisse passer EMAIL_NOT_VERIFIED jusqu'à la redirection
    // /verifier-email — c'est l'app qui décide. Le normalizer pure-fn lui-
    // même retourne TOUJOURS INVALID_CREDENTIALS, et c'est l'app qui peut
    // décider de surcharger ce comportement contextuellement.
    expect(normalizeAuthError('EMAIL_NOT_VERIFIED')).toBe('INVALID_CREDENTIALS');
  });

  it('retourne le même résultat peu importe le cas (anti-énumération)', () => {
    const reasons = [
      'USER_NOT_FOUND',
      'INVALID_PASSWORD',
      'ACCOUNT_DISABLED',
      'EMAIL_NOT_VERIFIED',
    ] as const;
    const results = reasons.map((r) => normalizeAuthError(r));
    expect(new Set(results).size).toBe(1);
    expect(results[0]).toBe('INVALID_CREDENTIALS');
  });
});
