// T020 — tests RED de prehashAndHash + verifyPrehashed (C2 / R3).
//
// Vérifie que :
//   - Le pré-hash SHA-256 neutralise la limite 72 octets de bcrypt
//   - Des mots de passe distincts > 72 chars produisent des hash distincts
//   - verifyPrehashed accepte le bon mot de passe et rejette le mauvais

import { describe, expect, it } from 'vitest';
import { DUMMY_HASH, prehashAndHash, verifyPrehashed } from '../src/password-hash';

describe('prehashAndHash + verifyPrehashed', () => {
  describe('round-trip', () => {
    it("hash + verify d'un mot de passe simple OK", async () => {
      const hash = await prehashAndHash('Maxime!Strong-2026');
      expect(await verifyPrehashed('Maxime!Strong-2026', hash)).toBe(true);
    });

    it('verify rejette un mot de passe différent', async () => {
      const hash = await prehashAndHash('Maxime!Strong-2026');
      expect(await verifyPrehashed('Wrong!Password-2026', hash)).toBe(false);
    });
  });

  describe('72-byte limit bypass via SHA-256 prehash', () => {
    it('mot de passe > 72 chars : 2 valeurs distinctes produisent des hash distincts', async () => {
      // bcrypt natif tronquerait à 72 octets et donnerait le même hash.
      // Avec le pré-hash SHA-256, les hash sont distincts.
      const a = `${'A'.repeat(72)}XYZ_alpha_1!`;
      const b = `${'A'.repeat(72)}XYZ_beta_2!`;
      const hashA = await prehashAndHash(a);
      const hashB = await prehashAndHash(b);
      expect(hashA).not.toBe(hashB);
      expect(await verifyPrehashed(a, hashA)).toBe(true);
      expect(await verifyPrehashed(b, hashA)).toBe(false);
      expect(await verifyPrehashed(b, hashB)).toBe(true);
    });

    it('mot de passe contenant des emojis (multi-octets UTF-8)', async () => {
      const a = 'Maxime🎉Strong-2026';
      const b = 'Maxime🎊Strong-2026';
      const hashA = await prehashAndHash(a);
      expect(await verifyPrehashed(a, hashA)).toBe(true);
      expect(await verifyPrehashed(b, hashA)).toBe(false);
    });
  });

  describe('cost factor', () => {
    it('le hash bcrypt utilise le cost 11 (signature $2a$11$ ou $2b$11$)', async () => {
      const hash = await prehashAndHash('Maxime!Strong-2026');
      expect(hash).toMatch(/^\$2[ab]\$11\$/);
    });
  });

  describe('DUMMY_HASH (anti-énumération R5)', () => {
    it('DUMMY_HASH est un hash bcrypt cost 11 valide', () => {
      expect(DUMMY_HASH).toMatch(/^\$2[ab]\$11\$/);
    });

    it('verifyPrehashed sur DUMMY_HASH retourne false pour tout mot de passe légitime', async () => {
      expect(await verifyPrehashed('AnyPassword!2026', DUMMY_HASH)).toBe(false);
    });
  });
});
