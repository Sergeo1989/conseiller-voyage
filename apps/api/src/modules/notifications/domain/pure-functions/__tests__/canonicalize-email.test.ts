// T018 — Tests Vitest canonicalizeEmail (fix B-4 review architecte).
//
// Couvre :
//   - Gmail : strip `+suffix` et `.` dans partie locale.
//   - Googlemail alias historique → gmail.com.
//   - Autres domaines : lowercase + trim seulement.
//   - Edge cases : casse, espaces, format invalide.

import { describe, expect, test } from 'vitest';
import { canonicalizeEmail } from '../canonicalize-email';

describe('canonicalizeEmail — feature 003', () => {
  describe('Gmail (alias et points)', () => {
    test('strip +suffix Gmail', () => {
      expect(canonicalizeEmail('user+tag@gmail.com')).toBe('user@gmail.com');
      expect(canonicalizeEmail('user+notifications@gmail.com')).toBe('user@gmail.com');
    });

    test('strip dots dans partie locale Gmail', () => {
      expect(canonicalizeEmail('u.s.e.r@gmail.com')).toBe('user@gmail.com');
      expect(canonicalizeEmail('john.doe@gmail.com')).toBe('johndoe@gmail.com');
    });

    test('combine strip dots et +suffix', () => {
      expect(canonicalizeEmail('j.o.h.n+spam@gmail.com')).toBe('john@gmail.com');
    });

    test('googlemail.com → gmail.com (alias historique)', () => {
      expect(canonicalizeEmail('user@googlemail.com')).toBe('user@gmail.com');
      expect(canonicalizeEmail('u.s.e.r+tag@googlemail.com')).toBe('user@gmail.com');
    });
  });

  describe('Autres domaines (lowercase + trim seulement)', () => {
    test('Outlook NE strip PAS les dots', () => {
      expect(canonicalizeEmail('john.doe@outlook.com')).toBe('john.doe@outlook.com');
    });

    test('Yahoo NE strip PAS les dots', () => {
      expect(canonicalizeEmail('user.name@yahoo.ca')).toBe('user.name@yahoo.ca');
    });

    test('Domaine custom NE strip PAS les dots ni les +', () => {
      expect(canonicalizeEmail('user+work@conseiller-voyage.ca')).toBe(
        'user+work@conseiller-voyage.ca',
      );
    });
  });

  describe('Normalisation casse + espaces', () => {
    test('lowercase systématique', () => {
      expect(canonicalizeEmail('USER@GMAIL.COM')).toBe('user@gmail.com');
      expect(canonicalizeEmail('John.Doe@Outlook.COM')).toBe('john.doe@outlook.com');
    });

    test('trim leading/trailing whitespace', () => {
      expect(canonicalizeEmail('  user@gmail.com  ')).toBe('user@gmail.com');
      expect(canonicalizeEmail('\tuser@example.com\n')).toBe('user@example.com');
    });
  });

  describe('Edge cases et erreurs', () => {
    test('lève si pas de @', () => {
      expect(() => canonicalizeEmail('invalid')).toThrow(/Invalid email format/);
    });

    test('lève si vide', () => {
      expect(() => canonicalizeEmail('')).toThrow(/Invalid email format/);
    });

    test('lève si @ en début', () => {
      expect(() => canonicalizeEmail('@gmail.com')).toThrow(/Invalid email format/);
    });

    test('lève si @ en fin', () => {
      expect(() => canonicalizeEmail('user@')).toThrow(/Invalid email format/);
    });

    test('lève si Gmail avec partie locale entièrement composée de dots et +', () => {
      // ".+@gmail.com" → après strip = "" → invalide
      expect(() => canonicalizeEmail('+@gmail.com')).toThrow(/Invalid email format/);
    });
  });

  describe('Idempotence', () => {
    test('canonicaliser deux fois donne le même résultat', () => {
      const once = canonicalizeEmail('U.S.E.R+tag@Gmail.com');
      const twice = canonicalizeEmail(once);
      expect(twice).toBe(once);
      expect(once).toBe('user@gmail.com');
    });
  });
});
