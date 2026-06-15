// T010 [016 US1] [TDD RED] — Tests mergeEnrichmentIntoSnapshot (axe spécialité).
// FR-003 (déterministe prévaut) + mode dégradé. Cf. data-model.md.
// (L'axe destinations est testé en US2 — T022.)

import { describe, expect, it } from 'vitest';
import type { BriefSnapshot } from '../../../application/ports/brief-snapshot-reader.port';
import {
  ENRICHMENT_CONFIDENCE_THRESHOLD,
  type EnrichmentForScoring,
  mergeEnrichmentIntoSnapshot,
} from '../merge-enrichment-into-snapshot';

const BASE: BriefSnapshot = {
  briefId: 'b1',
  destinations: [{ country: 'IT' }],
  conseillerLanguage: 'fr',
  speciality: 'autre',
  familiarity: 'occasional_traveler',
  voyageurFsa: null,
  suggestedConseillerId: null,
};

const ENRICHI = (over: Partial<EnrichmentForScoring> = {}): EnrichmentForScoring => ({
  status: 'enrichi',
  enrichedSpeciality: 'lune_de_miel',
  enrichedDestinations: [],
  confidence: 0.9,
  ...over,
});

describe('mergeEnrichmentIntoSnapshot — résolution spécialité', () => {
  it('résout `autre` → canonique quand enrichi + confiance ≥ seuil', () => {
    expect(mergeEnrichmentIntoSnapshot(BASE, ENRICHI()).speciality).toBe('lune_de_miel');
  });

  it('laisse une spécialité déterministe non-autre inchangée (FR-003)', () => {
    const det: BriefSnapshot = { ...BASE, speciality: 'croisiere' };
    expect(mergeEnrichmentIntoSnapshot(det, ENRICHI()).speciality).toBe('croisiere');
  });
});

describe('mergeEnrichmentIntoSnapshot — mode dégradé', () => {
  it('ignore l’enrichi sous le seuil de confiance', () => {
    const low = ENRICHI({ confidence: ENRICHMENT_CONFIDENCE_THRESHOLD - 0.01 });
    expect(mergeEnrichmentIntoSnapshot(BASE, low).speciality).toBe('autre');
  });

  it('ignore un statut non `enrichi`', () => {
    expect(mergeEnrichmentIntoSnapshot(BASE, ENRICHI({ status: 'partiel' })).speciality).toBe(
      'autre',
    );
  });

  it('ignore un enrichissement absent (null)', () => {
    expect(mergeEnrichmentIntoSnapshot(BASE, null).speciality).toBe('autre');
  });

  it('laisse `autre` si aucune spécialité canonique fournie', () => {
    expect(
      mergeEnrichmentIntoSnapshot(BASE, ENRICHI({ enrichedSpeciality: null })).speciality,
    ).toBe('autre');
  });

  it('ne modifie pas les autres champs du snapshot', () => {
    const out = mergeEnrichmentIntoSnapshot(BASE, ENRICHI());
    expect(out.destinations).toEqual(BASE.destinations);
    expect(out.conseillerLanguage).toBe('fr');
    expect(out.familiarity).toBe('occasional_traveler');
  });
});

describe('mergeEnrichmentIntoSnapshot — union des destinations (US2)', () => {
  it('augmente l’ensemble : déterministes d’abord, enrichies ensuite (ordre stable)', () => {
    const out = mergeEnrichmentIntoSnapshot(BASE, ENRICHI({ enrichedDestinations: ['FR', 'JP'] }));
    expect(out.destinations).toEqual([{ country: 'IT' }, { country: 'FR' }, { country: 'JP' }]);
  });

  it('conserve les déterministes et dédoublonne vs déterministe (FR-003)', () => {
    const out = mergeEnrichmentIntoSnapshot(BASE, ENRICHI({ enrichedDestinations: ['IT', 'FR'] }));
    expect(out.destinations).toEqual([{ country: 'IT' }, { country: 'FR' }]);
  });

  it('dédoublonne entre destinations enrichies', () => {
    const out = mergeEnrichmentIntoSnapshot(BASE, ENRICHI({ enrichedDestinations: ['FR', 'FR'] }));
    expect(out.destinations).toEqual([{ country: 'IT' }, { country: 'FR' }]);
  });

  it('n’injecte rien sous le seuil de confiance', () => {
    const low = ENRICHI({
      enrichedDestinations: ['FR'],
      confidence: ENRICHMENT_CONFIDENCE_THRESHOLD - 0.01,
    });
    expect(mergeEnrichmentIntoSnapshot(BASE, low).destinations).toEqual(BASE.destinations);
  });

  it('n’injecte rien si statut non `enrichi`', () => {
    const out = mergeEnrichmentIntoSnapshot(
      BASE,
      ENRICHI({ status: 'partiel', enrichedDestinations: ['FR'] }),
    );
    expect(out.destinations).toEqual(BASE.destinations);
  });
});
