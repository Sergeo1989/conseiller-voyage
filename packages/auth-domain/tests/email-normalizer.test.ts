// T015 — tests RED de normalizeEmail (R9 / H8).

import { describe, expect, it } from 'vitest';
import { normalizeEmail } from '../src/email-normalizer';

describe('normalizeEmail', () => {
  describe('casse', () => {
    it('met en minuscules', () => {
      expect(normalizeEmail('Maxime@Test.LOCAL')).toBe('maxime@test.local');
    });

    it('met en minuscules un email tout majuscule', () => {
      expect(normalizeEmail('ADMIN@CONSEILLER-VOYAGE.CA')).toBe('admin@conseiller-voyage.ca');
    });
  });

  describe('whitespace', () => {
    it('trim les espaces en début et fin', () => {
      expect(normalizeEmail('  maxime@test.local  ')).toBe('maxime@test.local');
    });

    it('trim les tabulations', () => {
      expect(normalizeEmail('\tmaxime@test.local\n')).toBe('maxime@test.local');
    });
  });

  describe('Unicode normalization', () => {
    it('normalise NFC (composé) — é (NFC, 1 codepoint) reste identique', () => {
      const composed = 'jérôme@test.local'; // é (composed, U+00E9)
      expect(normalizeEmail(composed)).toBe('jérôme@test.local');
    });

    it('normalise NFC — é (NFD, e + combining accent) devient identique à NFC', () => {
      const decomposed = 'jérôme@test.local'; // e + combining grave + o + circumflex
      const composed = 'jérôme@test.local';
      expect(normalizeEmail(decomposed)).toBe(normalizeEmail(composed));
    });
  });

  describe('préservation des +aliases (intention OWASP R9)', () => {
    it('ne strip PAS le +alias', () => {
      expect(normalizeEmail('Maxime+spam@test.local')).toBe('maxime+spam@test.local');
    });

    it('considère email+a et email+b comme distincts', () => {
      const a = normalizeEmail('user+a@test.local');
      const b = normalizeEmail('user+b@test.local');
      expect(a).not.toBe(b);
    });
  });

  describe('idempotence', () => {
    it('appliquer 2× donne le même résultat', () => {
      const once = normalizeEmail('  Maxime@Test.LOCAL  ');
      const twice = normalizeEmail(once);
      expect(twice).toBe(once);
    });
  });
});
