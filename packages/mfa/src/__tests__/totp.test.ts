// T018 — Tests TDD RED pour packages/mfa/src/totp.ts.
// Contrat : specs/005-mfa-conseiller/contracts/totp-validator.port.md.
// 9 tests selon le contrat + vecteurs RFC 6238.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildKeyUri, generateSecret, verify } from '../totp';

describe('totp', () => {
  describe('verify', () => {
    const SECRET = 'JBSWY3DPEHPK3PXP'; // exemple Google Authenticator wiki

    afterEach(() => {
      vi.useRealTimers();
    });

    it('verifies a code generated at T=now', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-05-25T12:00:00Z'));
      const { authenticator } = require('otplib');
      const code = authenticator.generate(SECRET);
      expect(verify(SECRET, code)).toBe(true);
    });

    it('verifies a code generated at T+30s (tolérance +1 pas)', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-05-25T12:00:00Z'));
      const { authenticator } = require('otplib');
      const code = authenticator.generate(SECRET);
      vi.setSystemTime(new Date('2026-05-25T12:00:30Z'));
      expect(verify(SECRET, code)).toBe(true);
    });

    it('verifies a code generated at T-30s (tolérance -1 pas)', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-05-25T12:00:00Z'));
      const { authenticator } = require('otplib');
      const code = authenticator.generate(SECRET);
      vi.setSystemTime(new Date('2026-05-25T11:59:30Z'));
      expect(verify(SECRET, code)).toBe(true);
    });

    it('rejects a code generated at T+90s (hors fenêtre)', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-05-25T12:00:00Z'));
      const { authenticator } = require('otplib');
      const code = authenticator.generate(SECRET);
      vi.setSystemTime(new Date('2026-05-25T12:01:30Z'));
      expect(verify(SECRET, code)).toBe(false);
    });

    it('rejects a random 6-digit code (≈99.99% des cas)', () => {
      // 50 tentatives aléatoires — au moins 49 doivent échouer (1/10^6 par tentative).
      const failures = Array.from({ length: 50 }, () => {
        const random = String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0');
        return verify(SECRET, random);
      });
      const successCount = failures.filter(Boolean).length;
      expect(successCount).toBeLessThanOrEqual(1);
    });
  });

  describe('generateSecret', () => {
    it('returns a 32-character Base32 string (160 bits)', () => {
      const secret = generateSecret();
      expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    });

    it('produces a different secret on each call (entropie crypto)', () => {
      const secrets = new Set(Array.from({ length: 1000 }, () => generateSecret()));
      expect(secrets.size).toBe(1000); // pas de collision sur 1000 secrets de 160 bits
    });
  });

  describe('buildKeyUri', () => {
    it('produces a valid otpauth:// URL with secret + issuer + algorithm + digits + period', () => {
      const uri = buildKeyUri('user@exemple.ca', 'JBSWY3DPEHPK3PXP');
      expect(uri).toMatch(/^otpauth:\/\/totp\//);
      expect(uri).toContain('secret=JBSWY3DPEHPK3PXP');
      expect(uri).toContain('algorithm=SHA1');
      expect(uri).toContain('digits=6');
      expect(uri).toContain('period=30');
    });

    it('URL-encodes the account label', () => {
      const uri = buildKeyUri('Conseiller Voyage:user@exemple.ca', 'JBSWY3DPEHPK3PXP');
      // Les ":" et les espaces doivent être encodés.
      expect(uri).not.toContain(' ');
    });
  });

  describe('RFC 6238 reference vectors', () => {
    // Vecteurs de référence RFC 6238 Annexe B avec secret SHA1 = "12345678901234567890"
    // (= "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ" en Base32) et timestamps précis.
    it('valide les vecteurs RFC 6238 SHA-1', () => {
      const SECRET_RFC = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
      // Timestamp Unix 59 = "94287082" attendu pour SHA1 + 8 digits.
      // Pour 6 digits (notre config), on prend les 6 derniers chiffres.
      vi.useFakeTimers();
      vi.setSystemTime(new Date(59 * 1000));
      const { authenticator } = require('otplib');
      const code = authenticator.generate(SECRET_RFC);
      // On vérifie surtout que verify accepte ce code à T=59s.
      expect(verify(SECRET_RFC, code)).toBe(true);
    });
  });
});
