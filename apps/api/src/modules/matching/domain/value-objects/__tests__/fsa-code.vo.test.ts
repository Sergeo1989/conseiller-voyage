// T036 [TDD RED] — Tests FsaCode VO (re-export depuis @cv/shared/matching).
// Forward Sortation Area canadien — 3 caractères majuscule strict.
// Le VO domain re-export l'implémentation de @cv/shared/matching pour
// éviter la duplication (la regex et le parsing sont identiques).

import { describe, expect, it } from 'vitest';
import { FSA_REGEX, asFsaCode, parseFsaFromPostalCode } from '../fsa-code.vo';

describe('FsaCode VO', () => {
  it('FSA_REGEX accepte 3 chars majuscule lettre/chiffre/lettre', () => {
    expect(FSA_REGEX.test('H7N')).toBe(true);
    expect(FSA_REGEX.test('M5V')).toBe(true);
    expect(FSA_REGEX.test('K1A')).toBe(true);
  });

  it('FSA_REGEX refuse minuscule', () => {
    expect(FSA_REGEX.test('h7n')).toBe(false);
  });

  it('FSA_REGEX refuse format invalide', () => {
    expect(FSA_REGEX.test('H7')).toBe(false); // trop court
    expect(FSA_REGEX.test('H7NN')).toBe(false); // trop long
    expect(FSA_REGEX.test('777')).toBe(false); // pas de lettres
    expect(FSA_REGEX.test('HHH')).toBe(false); // pas de chiffre
  });

  it('asFsaCode parse strict (lance si invalide)', () => {
    expect(asFsaCode('H7N')).toBe('H7N');
    expect(() => asFsaCode('h7n')).toThrow();
    expect(() => asFsaCode('123')).toThrow();
  });

  it('parseFsaFromPostalCode accepte format avec espace', () => {
    expect(parseFsaFromPostalCode('H7N 1A1')).toBe('H7N');
    expect(parseFsaFromPostalCode('M5V 3A8')).toBe('M5V');
  });

  it('parseFsaFromPostalCode accepte format sans espace', () => {
    expect(parseFsaFromPostalCode('H7N1A1')).toBe('H7N');
  });

  it('parseFsaFromPostalCode accepte minuscule (normalisation)', () => {
    expect(parseFsaFromPostalCode('h7n 1a1')).toBe('H7N');
  });

  it('parseFsaFromPostalCode retourne null sur code postal invalide', () => {
    expect(parseFsaFromPostalCode(null)).toBeNull();
    expect(parseFsaFromPostalCode(undefined)).toBeNull();
    expect(parseFsaFromPostalCode('')).toBeNull();
    expect(parseFsaFromPostalCode('123 456')).toBeNull(); // pas lettre+chiffre+lettre
    expect(parseFsaFromPostalCode('AB')).toBeNull(); // trop court
  });
});
