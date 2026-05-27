// T019 — Tests Vitest hash-recipient-email + matchRecipientEmailHash.

import { describe, expect, test } from 'vitest';
import { hashRecipientEmail, matchRecipientEmailHash } from '../hash-recipient-email';

const PEPPER_A = 'test-pepper-A-base64-string-256-bits-equivalent';
const PEPPER_B = 'test-pepper-B-different-string-for-rotation';

describe('hashRecipientEmail — feature 003', () => {
  test('produit un hex de 64 chars', () => {
    const hash = hashRecipientEmail('user@gmail.com', PEPPER_A);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  test('déterministe pour la même paire (email, pepper)', () => {
    const h1 = hashRecipientEmail('user@gmail.com', PEPPER_A);
    const h2 = hashRecipientEmail('user@gmail.com', PEPPER_A);
    expect(h1).toBe(h2);
  });

  test('hash différent pour pepper différent', () => {
    const hA = hashRecipientEmail('user@gmail.com', PEPPER_A);
    const hB = hashRecipientEmail('user@gmail.com', PEPPER_B);
    expect(hA).not.toBe(hB);
  });

  test('hash différent pour emails différents (même pepper)', () => {
    const h1 = hashRecipientEmail('user1@gmail.com', PEPPER_A);
    const h2 = hashRecipientEmail('user2@gmail.com', PEPPER_A);
    expect(h1).not.toBe(h2);
  });

  test('lève si email vide', () => {
    expect(() => hashRecipientEmail('', PEPPER_A)).toThrow(/empty email/);
  });

  test('lève si pepper vide', () => {
    expect(() => hashRecipientEmail('user@gmail.com', '')).toThrow(/empty pepper/);
  });
});

describe('matchRecipientEmailHash — multi-pepper fallback', () => {
  test('match avec pepper courant en premier', () => {
    const hash = hashRecipientEmail('user@gmail.com', PEPPER_A);
    expect(matchRecipientEmailHash('user@gmail.com', hash, [PEPPER_A, PEPPER_B])).toBe(true);
  });

  test('match avec pepper précédent (rotation)', () => {
    const hashOld = hashRecipientEmail('user@gmail.com', PEPPER_B);
    expect(matchRecipientEmailHash('user@gmail.com', hashOld, [PEPPER_A, PEPPER_B])).toBe(true);
  });

  test('ne match pas si aucun pepper ne fonctionne', () => {
    const hashRogue = hashRecipientEmail('user@gmail.com', 'unknown-pepper');
    expect(matchRecipientEmailHash('user@gmail.com', hashRogue, [PEPPER_A, PEPPER_B])).toBe(false);
  });

  test('ne match pas si email différent', () => {
    const hash = hashRecipientEmail('other@gmail.com', PEPPER_A);
    expect(matchRecipientEmailHash('user@gmail.com', hash, [PEPPER_A, PEPPER_B])).toBe(false);
  });

  test('liste vide de peppers → toujours false', () => {
    const hash = hashRecipientEmail('user@gmail.com', PEPPER_A);
    expect(matchRecipientEmailHash('user@gmail.com', hash, [])).toBe(false);
  });
});
