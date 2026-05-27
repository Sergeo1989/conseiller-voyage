// T018 — Tests TDD RED pour formaterNomAffiche FR-CA (Principe VI, R5).
//
// Table de référence (R5) couvrant les cas FR-CA :
//   - Nom simple : Marie Dupont
//   - Nom composé tiret : Jean-Pierre Le Goff, Marie-Claire Dupont-Tremblay
//   - Particules : de la Tour, du Pont, St-Pierre
//   - Accents : Élise Côté

import { describe, expect, it } from 'vitest';
import { formaterNomAffiche } from '../src/nom-affiche';

describe('formaterNomAffiche (FR-CA, fonction pure)', () => {
  describe('mode compact (afficherNomComplet=false) — défaut', () => {
    it('produit `Marie D.` pour ("Marie", "Dupont")', () => {
      expect(
        formaterNomAffiche({ prenomLegal: 'Marie', nomLegal: 'Dupont', afficherNomComplet: false }),
      ).toBe('Marie D.');
    });

    it('produit `Jean-Pierre G.` pour ("Jean-Pierre", "Le Goff") — particule "Le" sautée', () => {
      expect(
        formaterNomAffiche({
          prenomLegal: 'Jean-Pierre',
          nomLegal: 'Le Goff',
          afficherNomComplet: false,
        }),
      ).toBe('Jean-Pierre G.');
    });

    it('produit `Sébastien T.` pour ("Sébastien", "de la Tour") — particule "de la" sautée', () => {
      expect(
        formaterNomAffiche({
          prenomLegal: 'Sébastien',
          nomLegal: 'de la Tour',
          afficherNomComplet: false,
        }),
      ).toBe('Sébastien T.');
    });

    it('produit `Anne P.` pour ("Anne", "du Pont") — particule "du" sautée', () => {
      expect(
        formaterNomAffiche({ prenomLegal: 'Anne', nomLegal: 'du Pont', afficherNomComplet: false }),
      ).toBe('Anne P.');
    });

    it('produit `Marc S.` pour ("Marc", "St-Pierre") — préfixe Saint préservé via composition tiret', () => {
      expect(
        formaterNomAffiche({
          prenomLegal: 'Marc',
          nomLegal: 'St-Pierre',
          afficherNomComplet: false,
        }),
      ).toBe('Marc S.');
    });

    it('produit `Marie D.` pour ("Marie", "Dupont-Tremblay") — composition tiret = 1ère lettre du 1er sous-mot', () => {
      expect(
        formaterNomAffiche({
          prenomLegal: 'Marie',
          nomLegal: 'Dupont-Tremblay',
          afficherNomComplet: false,
        }),
      ).toBe('Marie D.');
    });

    it('préserve les accents du prénom : `Élise C.`', () => {
      expect(
        formaterNomAffiche({ prenomLegal: 'Élise', nomLegal: 'Côté', afficherNomComplet: false }),
      ).toBe('Élise C.');
    });
  });

  describe('mode complet (afficherNomComplet=true)', () => {
    it('produit `Marie Dupont` (concaténation simple)', () => {
      expect(
        formaterNomAffiche({ prenomLegal: 'Marie', nomLegal: 'Dupont', afficherNomComplet: true }),
      ).toBe('Marie Dupont');
    });

    it('préserve les noms composés `Jean-Pierre Le Goff`', () => {
      expect(
        formaterNomAffiche({
          prenomLegal: 'Jean-Pierre',
          nomLegal: 'Le Goff',
          afficherNomComplet: true,
        }),
      ).toBe('Jean-Pierre Le Goff');
    });

    it('préserve les particules `Sébastien de la Tour`', () => {
      expect(
        formaterNomAffiche({
          prenomLegal: 'Sébastien',
          nomLegal: 'de la Tour',
          afficherNomComplet: true,
        }),
      ).toBe('Sébastien de la Tour');
    });

    it('préserve les noms composés à tiret `Marie Dupont-Tremblay`', () => {
      expect(
        formaterNomAffiche({
          prenomLegal: 'Marie',
          nomLegal: 'Dupont-Tremblay',
          afficherNomComplet: true,
        }),
      ).toBe('Marie Dupont-Tremblay');
    });
  });
});
