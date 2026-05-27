// TDD RED — Tests des fonctions pures de comparaison de version.
// Cohérent avec le pattern 001 (T017+T018 RED, T019 GREEN).
//
// Cf. specs/004-mentions-legales/plan.md + tasks.md T017-T019.

import { describe, expect, it } from 'vitest';
import { compareLegalVersion, shouldRequireReacceptance } from '../version';

describe('compareLegalVersion (T017)', () => {
  describe('jamais accepté', () => {
    it("retourne 'never_accepted' quand lastAcceptedVersion est null", () => {
      expect(compareLegalVersion(1, null)).toBe('never_accepted');
      expect(compareLegalVersion(99, null)).toBe('never_accepted');
    });
  });

  describe('à jour', () => {
    it("retourne 'up_to_date' quand les versions sont identiques", () => {
      expect(compareLegalVersion(1, 1)).toBe('up_to_date');
      expect(compareLegalVersion(5, 5)).toBe('up_to_date');
      expect(compareLegalVersion(42, 42)).toBe('up_to_date');
    });
  });

  describe('obsolète', () => {
    it("retourne 'outdated' quand lastAcceptedVersion est strictement inférieur", () => {
      expect(compareLegalVersion(2, 1)).toBe('outdated');
      expect(compareLegalVersion(10, 5)).toBe('outdated');
      expect(compareLegalVersion(99, 1)).toBe('outdated');
    });
  });

  describe('cas dégénérés', () => {
    it('rejette currentDocumentVersion ≤ 0', () => {
      expect(() => compareLegalVersion(0, 1)).toThrow();
      expect(() => compareLegalVersion(-1, 1)).toThrow();
    });

    it('rejette lastAcceptedVersion ≤ 0 (mais non-null)', () => {
      expect(() => compareLegalVersion(1, 0)).toThrow();
      expect(() => compareLegalVersion(5, -3)).toThrow();
    });

    it('rejette lastAcceptedVersion > currentDocumentVersion (incohérence forward)', () => {
      // Un user ne devrait jamais avoir accepté une version "future". Si ça
      // arrive, c'est un bug en amont (race condition, données corrompues)
      // qu'on veut détecter explicitement.
      expect(() => compareLegalVersion(1, 2)).toThrow();
      expect(() => compareLegalVersion(5, 99)).toThrow();
    });

    it('rejette les versions non-entières', () => {
      expect(() => compareLegalVersion(1.5, 1)).toThrow();
      expect(() => compareLegalVersion(2, 1.1)).toThrow();
    });
  });
});

describe('shouldRequireReacceptance (T018)', () => {
  it('retourne true quand jamais accepté (lastAccepted=null)', () => {
    expect(shouldRequireReacceptance(null, 1)).toBe(true);
    expect(shouldRequireReacceptance(null, 99)).toBe(true);
  });

  it('retourne true quand obsolète', () => {
    expect(shouldRequireReacceptance(1, 2)).toBe(true);
    expect(shouldRequireReacceptance(5, 10)).toBe(true);
  });

  it('retourne false quand à jour', () => {
    expect(shouldRequireReacceptance(1, 1)).toBe(false);
    expect(shouldRequireReacceptance(42, 42)).toBe(false);
  });

  it('propage les erreurs de compareLegalVersion sur entrées dégénérées', () => {
    expect(() => shouldRequireReacceptance(2, 1)).toThrow(); // lastAccepted > current
    expect(() => shouldRequireReacceptance(0, 1)).toThrow(); // lastAccepted ≤ 0
  });
});
