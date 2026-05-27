// T019 — Tests TDD RED pour packages/mfa/src/backup-codes.ts.
// Contrat : specs/005-mfa-conseiller/contracts/backup-code-hasher.port.md.

import { describe, expect, it } from 'vitest';
import {
  BACKUP_CODE_REGEX,
  generateBatch,
  hashCode,
  normalizeCode,
  verifyCode,
} from '../backup-codes';

describe('backup-codes', () => {
  describe('generateBatch', () => {
    it('génère exactement 10 codes', () => {
      const batch = generateBatch();
      expect(batch).toHaveLength(10);
    });

    it('chaque code respecte le format XXXX-XXXX-XX (alphabet sans 0,O,1,I,L)', () => {
      const batch = generateBatch();
      for (const code of batch) {
        expect(code).toMatch(BACKUP_CODE_REGEX);
        expect(code).not.toContain('0');
        expect(code).not.toContain('O');
        expect(code).not.toContain('1');
        expect(code).not.toContain('I');
        expect(code).not.toContain('L');
      }
    });

    it('codes du même lot sont tous distincts', () => {
      const batch = generateBatch();
      const set = new Set(batch);
      expect(set.size).toBe(10);
    });

    it('lots successifs sont distincts (entropie crypto)', () => {
      // 100 lots × 10 codes = 1000 codes. Pas de collision attendue.
      const all = new Set<string>();
      for (let i = 0; i < 100; i++) {
        for (const code of generateBatch()) {
          all.add(code);
        }
      }
      expect(all.size).toBe(1000);
    });
  });

  describe('normalizeCode', () => {
    it('force la casse en majuscules', () => {
      expect(normalizeCode('abcd-efgh-ij')).toBe('ABCD-EFGH-IJ');
    });

    it('préserve les tirets (significatifs dans le format)', () => {
      expect(normalizeCode('ABCD-EFGH-IJ')).toBe('ABCD-EFGH-IJ');
    });

    it('idempotent (normalize(normalize(x)) === normalize(x))', () => {
      const input = 'abCD-eFgH-iJ';
      const once = normalizeCode(input);
      expect(normalizeCode(once)).toBe(once);
    });
  });

  describe('hashCode + verifyCode (bcrypt round-trip)', () => {
    it('verify(code, hash(code)) === true', async () => {
      const code = 'ABCD-EFGH-IJ';
      const hash = await hashCode(code);
      expect(await verifyCode(code, hash)).toBe(true);
    });

    it('verify(otherCode, hash(code)) === false', async () => {
      const hash = await hashCode('ABCD-EFGH-IJ');
      expect(await verifyCode('XXXX-YYYY-ZZ', hash)).toBe(false);
    });

    it('normalisation casse — verify(lowercase, hash(uppercase)) === true', async () => {
      const hash = await hashCode('ABCD-EFGH-IJ');
      expect(await verifyCode('abcd-efgh-ij', hash)).toBe(true);
    });

    it('hash respecte cost ≥ 12 (préfixe $2[ay]$12$ ou plus)', async () => {
      const hash = await hashCode('ABCD-EFGH-IJ');
      expect(hash).toMatch(/^\$2[aby]\$1[2-9]\$/);
    });

    it('hash fait exactement 60 caractères', async () => {
      const hash = await hashCode('ABCD-EFGH-IJ');
      expect(hash).toHaveLength(60);
    });
  });
});
