// T016 — Tests TDD RED pour calculerStatutProfil + profilEstComplet (Principe VI).
//
// Couvre la matrice booléenne 4×2 = 16 combinaisons + cas de complétude
// champ par champ. Cf. data-model.md + M6 (statut persisté + recalculé).

import { describe, expect, it } from 'vitest';
import { calculerStatutProfil, profilEstComplet } from '../src/statut-profil';

describe('calculerStatutProfil (matrice exhaustive 16 combinaisons)', () => {
  it('anonymise → toujours `anonymise` (terminal, override)', () => {
    // 8 cas où anonymise === true
    for (const verifie of [true, false]) {
      for (const profilComplet of [true, false]) {
        for (const masqueAdmin of [true, false]) {
          expect(
            calculerStatutProfil({ verifie, profilComplet, masqueAdmin, anonymise: true }),
          ).toBe('anonymise');
        }
      }
    }
  });

  it('masqueAdmin (sans anonymise) → `masque_admin` (override)', () => {
    // 4 cas où anonymise=false, masqueAdmin=true
    for (const verifie of [true, false]) {
      for (const profilComplet of [true, false]) {
        expect(
          calculerStatutProfil({ verifie, profilComplet, masqueAdmin: true, anonymise: false }),
        ).toBe('masque_admin');
      }
    }
  });

  it('verifie + profilComplet (sans override) → `pret`', () => {
    expect(
      calculerStatutProfil({
        verifie: true,
        profilComplet: true,
        masqueAdmin: false,
        anonymise: false,
      }),
    ).toBe('pret');
  });

  it('!verifie OU !profilComplet (sans override) → `incomplet`', () => {
    expect(
      calculerStatutProfil({
        verifie: false,
        profilComplet: true,
        masqueAdmin: false,
        anonymise: false,
      }),
    ).toBe('incomplet');
    expect(
      calculerStatutProfil({
        verifie: true,
        profilComplet: false,
        masqueAdmin: false,
        anonymise: false,
      }),
    ).toBe('incomplet');
    expect(
      calculerStatutProfil({
        verifie: false,
        profilComplet: false,
        masqueAdmin: false,
        anonymise: false,
      }),
    ).toBe('incomplet');
  });
});

describe('profilEstComplet (calcul des champs obligatoires)', () => {
  const profilOk = {
    titre: 'Conseillère spécialisée',
    biographie: 'A'.repeat(100),
    specialitesCount: 1,
    languesCount: 1,
    zonesGeographiquesCount: 1,
    anneesExperience: 5,
    photoS3Key: 'profiles/x/y.jpg',
  };

  it('retourne true si tous les champs obligatoires sont remplis', () => {
    expect(profilEstComplet(profilOk)).toBe(true);
  });

  it('retourne false si titre manquant', () => {
    expect(profilEstComplet({ ...profilOk, titre: null })).toBe(false);
    expect(profilEstComplet({ ...profilOk, titre: '' })).toBe(false);
  });

  it('retourne false si biographie < 100 chars', () => {
    expect(profilEstComplet({ ...profilOk, biographie: null })).toBe(false);
    expect(profilEstComplet({ ...profilOk, biographie: 'A'.repeat(99) })).toBe(false);
  });

  it('retourne false si aucune spécialité', () => {
    expect(profilEstComplet({ ...profilOk, specialitesCount: 0 })).toBe(false);
  });

  it('retourne false si aucune langue', () => {
    expect(profilEstComplet({ ...profilOk, languesCount: 0 })).toBe(false);
  });

  it('retourne false si aucune zone géographique', () => {
    expect(profilEstComplet({ ...profilOk, zonesGeographiquesCount: 0 })).toBe(false);
  });

  it('retourne false si années expérience NULL', () => {
    expect(profilEstComplet({ ...profilOk, anneesExperience: null })).toBe(false);
  });

  it('retourne false si photo absente', () => {
    expect(profilEstComplet({ ...profilOk, photoS3Key: null })).toBe(false);
    expect(profilEstComplet({ ...profilOk, photoS3Key: '' })).toBe(false);
  });
});
