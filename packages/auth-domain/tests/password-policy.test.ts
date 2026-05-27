// T016 — tests RED de validatePasswordPolicy (FR-003).
//
// Politique : 12..128 chars, ≥1 minuscule, ≥1 majuscule, ≥1 chiffre, ≥1 symbole.
// Refus si contient l'email ou le prénom (insensible à la casse).

import { describe, expect, it } from 'vitest';
import { validatePasswordPolicy } from '../src/password-policy';

describe('validatePasswordPolicy', () => {
  describe('longueur', () => {
    it('refuse < 12 caractères', () => {
      const result = validatePasswordPolicy('Short1!');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors).toContain('PASSWORD_TOO_SHORT');
      }
    });

    it('accepte exactement 12 caractères', () => {
      const result = validatePasswordPolicy('Abc12345!def');
      expect(result.ok).toBe(true);
    });

    it('refuse > 128 caractères', () => {
      // Mot de passe à exactement 128 caractères, avec les 4 classes obligatoires.
      const long = `Abc1!${'x'.repeat(123)}`; // 5 + 123 = 128 chars OK
      const tooLong = `${long}x`; // 129 chars KO
      expect(validatePasswordPolicy(long).ok).toBe(true);
      const result = validatePasswordPolicy(tooLong);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors).toContain('PASSWORD_TOO_LONG');
      }
    });

    it('refuse string vide', () => {
      const result = validatePasswordPolicy('');
      expect(result.ok).toBe(false);
    });
  });

  describe('classes de caractères', () => {
    it('refuse sans majuscule', () => {
      const result = validatePasswordPolicy('abc12345678!');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors).toContain('PASSWORD_MISSING_UPPERCASE');
      }
    });

    it('refuse sans minuscule', () => {
      const result = validatePasswordPolicy('ABC12345678!');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors).toContain('PASSWORD_MISSING_LOWERCASE');
      }
    });

    it('refuse sans chiffre', () => {
      const result = validatePasswordPolicy('Abcdefghij!@');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors).toContain('PASSWORD_MISSING_DIGIT');
      }
    });

    it('refuse sans symbole', () => {
      const result = validatePasswordPolicy('Abc12345defg');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors).toContain('PASSWORD_MISSING_SYMBOL');
      }
    });

    it('accepte avec les 4 classes', () => {
      expect(validatePasswordPolicy('Maxime!Strong-2026').ok).toBe(true);
    });
  });

  describe('contenu prohibé (contexte email / prénom)', () => {
    it("refuse si contient l'email (lowercase)", () => {
      const result = validatePasswordPolicy(
        'maxime@test.local-Pwd!',
        'maxime@test.local',
        'Maxime',
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors).toContain('PASSWORD_CONTAINS_EMAIL');
      }
    });

    it("refuse si contient l'email avec casse différente", () => {
      const result = validatePasswordPolicy(
        'MAXIME@TEST.LOCAL-Pwd!',
        'maxime@test.local',
        'Maxime',
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors).toContain('PASSWORD_CONTAINS_EMAIL');
      }
    });

    it('refuse si contient le prénom (insensible casse)', () => {
      const result = validatePasswordPolicy('AlmaxIMe123!XX', 'jdoe@test.local', 'Maxime');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors).toContain('PASSWORD_CONTAINS_FIRSTNAME');
      }
    });

    it('ignore prénom trop court (< 4 chars) pour ne pas matcher accidentellement', () => {
      // Prénom = "Al" (2 chars) — ne devrait pas matcher dans un mot de passe long.
      const result = validatePasswordPolicy('Alphabet123!ZZ', 'jdoe@test.local', 'Al');
      expect(result.ok).toBe(true);
    });

    it('accepte si email et prénom non fournis', () => {
      expect(validatePasswordPolicy('Maxime!Strong-2026').ok).toBe(true);
    });
  });

  describe("messages d'erreur", () => {
    it("retourne TOUS les codes d'erreur en un seul appel", () => {
      const result = validatePasswordPolicy('abc'); // trop court + sans majuscule + sans chiffre + sans symbole
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors).toEqual(
          expect.arrayContaining([
            'PASSWORD_TOO_SHORT',
            'PASSWORD_MISSING_UPPERCASE',
            'PASSWORD_MISSING_DIGIT',
            'PASSWORD_MISSING_SYMBOL',
          ]),
        );
      }
    });
  });
});
