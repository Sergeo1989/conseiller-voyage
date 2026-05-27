// T014 — Tests TDD RED pour detecterFormatImage (Principe VI, R3 + C3).
//
// Validation MIME structurelle via lecture des 12 premiers octets.
// Anti-spoofing : un fichier `.exe` renommé `.jpg` doit être rejeté.
// Anti faux positif : WAV/AVI partagent le RIFF en tête mais diffèrent à
// l'offset 8 — la vérif WebP doit lire les 12 octets, pas juste les 4.

import { describe, expect, it } from 'vitest';
import { detecterFormatImage } from '../src/magic-number';

const buf = (bytes: number[]): Buffer => Buffer.from(bytes);

describe('detecterFormatImage (fonction pure)', () => {
  describe('JPEG (FF D8 FF + flag JFIF/EXIF)', () => {
    it('détecte JFIF FF D8 FF E0', () => {
      expect(detecterFormatImage(buf([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]))).toBe(
        'jpeg',
      );
    });

    it('détecte EXIF FF D8 FF E1', () => {
      expect(detecterFormatImage(buf([0xff, 0xd8, 0xff, 0xe1, 0, 0, 0, 0, 0, 0, 0, 0]))).toBe(
        'jpeg',
      );
    });

    it('détecte SPIFF FF D8 FF E8', () => {
      expect(detecterFormatImage(buf([0xff, 0xd8, 0xff, 0xe8, 0, 0, 0, 0, 0, 0, 0, 0]))).toBe(
        'jpeg',
      );
    });
  });

  describe('PNG (signature 8 octets stricte)', () => {
    it('détecte 89 50 4E 47 0D 0A 1A 0A + reste', () => {
      expect(
        detecterFormatImage(buf([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])),
      ).toBe('png');
    });

    it('rejette signature PNG tronquée (7 premiers octets seulement)', () => {
      expect(
        detecterFormatImage(buf([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x99, 0, 0, 0, 0])),
      ).toBe(null);
    });
  });

  describe('WebP (RIFF + WEBP à offset 8)', () => {
    it('détecte RIFF...WEBP correctement', () => {
      // 'R' 'I' 'F' 'F' .. .. .. .. 'W' 'E' 'B' 'P'
      expect(
        detecterFormatImage(buf([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50])),
      ).toBe('webp');
    });

    it('REJETTE un WAV (RIFF + WAVE à offset 8) — faux positif évité', () => {
      // 'R' 'I' 'F' 'F' .. .. .. .. 'W' 'A' 'V' 'E'
      expect(
        detecterFormatImage(buf([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x41, 0x56, 0x45])),
      ).toBe(null);
    });

    it('REJETTE un AVI (RIFF + AVI à offset 8) — faux positif évité', () => {
      // 'R' 'I' 'F' 'F' .. .. .. .. 'A' 'V' 'I' ' '
      expect(
        detecterFormatImage(buf([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x41, 0x56, 0x49, 0x20])),
      ).toBe(null);
    });
  });

  describe('cas dégénérés', () => {
    it('retourne null pour buffer trop court (< 12 octets)', () => {
      expect(detecterFormatImage(buf([0xff, 0xd8, 0xff, 0xe0]))).toBe(null);
      expect(detecterFormatImage(buf([]))).toBe(null);
    });

    it('retourne null pour format inconnu', () => {
      // GIF, BMP, etc.
      expect(detecterFormatImage(buf([0x47, 0x49, 0x46, 0x38, 0, 0, 0, 0, 0, 0, 0, 0]))).toBe(null);
    });

    it('retourne null pour exécutable renommé (MZ header EXE Windows)', () => {
      expect(detecterFormatImage(buf([0x4d, 0x5a, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]))).toBe(null);
    });
  });
});
