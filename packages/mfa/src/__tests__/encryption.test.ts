// T020 — Tests TDD RED pour packages/mfa/src/encryption.ts.
// Contrat : specs/005-mfa-conseiller/contracts/mfa-encrypter.port.md.
// ADR-0010 : AES-256-GCM via node:crypto.

import { describe, expect, it } from 'vitest';
import {
  KekInvalidSizeError,
  TotpSecretFormatError,
  TotpSecretIntegrityError,
  decrypt,
  encrypt,
} from '../encryption';

// KEK de test = 32 octets de zéro encodés base64 (cohérent avec CI).
const ZERO_KEK = Buffer.alloc(32).toString('base64');

// KEK de test alternative pour confirmer que le ciphertext diffère.
const ALT_KEK = Buffer.from(
  '1111111111111111111111111111111111111111111111111111111111111111',
  'hex',
).toString('base64');

describe('encryption (AES-256-GCM)', () => {
  describe('round-trip', () => {
    it('decrypt(encrypt(x, kek), kek) === x', () => {
      const plaintext = 'JBSWY3DPEHPK3PXP'; // secret TOTP Base32 typique
      const encrypted = encrypt(plaintext, ZERO_KEK);
      expect(decrypt(encrypted, ZERO_KEK)).toBe(plaintext);
    });

    it('round-trip avec secret long (256 bits)', () => {
      const plaintext = 'A'.repeat(52); // ~256 bits Base32
      const encrypted = encrypt(plaintext, ZERO_KEK);
      expect(decrypt(encrypted, ZERO_KEK)).toBe(plaintext);
    });
  });

  describe('IV unicité', () => {
    it('deux appels successifs produisent deux ciphertexts différents', () => {
      const plaintext = 'JBSWY3DPEHPK3PXP';
      const c1 = encrypt(plaintext, ZERO_KEK);
      const c2 = encrypt(plaintext, ZERO_KEK);
      expect(c1).not.toBe(c2);
    });
  });

  describe('auth tag (intégrité GCM)', () => {
    it("altération d'un byte du ciphertext → TotpSecretIntegrityError", () => {
      const encrypted = encrypt('JBSWY3DPEHPK3PXP', ZERO_KEK);
      // Modifie un caractère en milieu de blob — change un byte de
      // ciphertext ou auth tag. On choisit un remplacement DIFFÉRENT du
      // caractère original (sinon, si pos 20 contient déjà 'X', le blob
      // reste identique et decrypt réussit — test flaky historique).
      const original = encrypted.charAt(20);
      const replacement = original === 'A' ? 'B' : 'A';
      const tampered = `${encrypted.slice(0, 20)}${replacement}${encrypted.slice(21)}`;
      expect(() => decrypt(tampered as never, ZERO_KEK)).toThrow(TotpSecretIntegrityError);
    });

    it('décryption avec mauvaise KEK → TotpSecretIntegrityError', () => {
      const encrypted = encrypt('JBSWY3DPEHPK3PXP', ZERO_KEK);
      expect(() => decrypt(encrypted, ALT_KEK)).toThrow(TotpSecretIntegrityError);
    });
  });

  describe('format errors', () => {
    it('Base64 mal formé → TotpSecretFormatError', () => {
      expect(() => decrypt('not-base64!@#$' as never, ZERO_KEK)).toThrow(TotpSecretFormatError);
    });

    it('blob trop court → TotpSecretFormatError', () => {
      const tooShort = Buffer.from([0x01, 0x00]).toString('base64');
      expect(() => decrypt(tooShort as never, ZERO_KEK)).toThrow(TotpSecretFormatError);
    });

    it('version byte inconnue (0x99) → TotpSecretFormatError', () => {
      // Construit un blob avec version byte = 0x99 + IV bidon + ciphertext bidon + tag bidon
      const fakeBlob = Buffer.concat([
        Buffer.from([0x99]),
        Buffer.alloc(12), // IV
        Buffer.from('XX'), // ciphertext
        Buffer.alloc(16), // auth tag
      ]).toString('base64');
      expect(() => decrypt(fakeBlob as never, ZERO_KEK)).toThrow(TotpSecretFormatError);
    });
  });

  describe('KEK validation', () => {
    it('KEK de 16 octets au lieu de 32 → KekInvalidSizeError', () => {
      const shortKek = Buffer.alloc(16).toString('base64');
      expect(() => encrypt('JBSWY3DPEHPK3PXP', shortKek)).toThrow(KekInvalidSizeError);
    });
  });
});
