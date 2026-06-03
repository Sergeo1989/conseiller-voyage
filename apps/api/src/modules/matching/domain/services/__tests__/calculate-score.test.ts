// T044 [TDD RED] — Tests calculateScore (fonction pure 4 axes scorés).
// La langue est un filtre dur AVANT scoring (Q3) — calculateScore suppose
// que le filtre est déjà appliqué et ne re-vérifie pas.

import { describe, expect, it } from 'vitest';
import type { BriefSnapshot } from '../../../application/ports/brief-snapshot-reader.port';
import type { ConseillerSnapshot } from '../../../application/ports/conseiller-snapshot-reader.port';
import type { FsaCentroidTable } from '../../../application/ports/fsa-centroid-reader.port';
import { asFsaCode } from '../../value-objects/fsa-code.vo';
import { calculateScore } from '../calculate-score';

const CENTROIDS: FsaCentroidTable = new Map([
  [asFsaCode('H7N'), { lat: 45.5736, lng: -73.7239, province: 'QC' as const }],
  [asFsaCode('H2X'), { lat: 45.5125, lng: -73.5658, province: 'QC' as const }],
  [asFsaCode('M5V'), { lat: 43.6435, lng: -79.3954, province: 'ON' as const }],
]);

function makeBrief(overrides: Partial<BriefSnapshot> = {}): BriefSnapshot {
  return {
    briefId: '11111111-1111-4111-8111-111111111111',
    destinations: [{ country: 'CU', region: 'La Havane' }],
    conseillerLanguage: 'fr',
    speciality: 'lune_de_miel',
    familiarity: 'experienced_traveler',
    voyageurFsa: asFsaCode('H7N'),
    suggestedConseillerId: null,
    ...overrides,
  };
}

function makeConseiller(overrides: Partial<ConseillerSnapshot> = {}): ConseillerSnapshot {
  return {
    conseillerId: '22222222-2222-4222-8222-222222222222',
    languages: ['fr'],
    specialities: ['lune_de_miel', 'famille_avec_enfants'],
    destinations: [{ country: 'CU' }, { country: 'MX' }],
    experienceTier: 'pair',
    fsa: asFsaCode('H2X'),
    ...overrides,
  };
}

describe('calculateScore — fonction pure 4 axes', () => {
  it('match parfait sur tous les axes → composantes élevées', () => {
    const c = calculateScore(makeBrief(), makeConseiller(), CENTROIDS);
    expect(c.destination).toBe(1); // CU dans destinations conseiller
    expect(c.geo).toBe(0.8); // ~15 km Laval ↔ Plateau → palier 0-25
    expect(c.speciality).toBe(1); // lune_de_miel dans specialities conseiller
    // familiarity : experienced_traveler ↔ pair = match parfait (1.0)
    expect(c.familiarity).toBe(1);
  });

  it('destination unknown → score destination 0', () => {
    const c = calculateScore(
      makeBrief({ destinations: [{ country: 'BT' }] }), // Bhoutan, non couvert
      makeConseiller(),
      CENTROIDS,
    );
    expect(c.destination).toBe(0);
  });

  it('spécialité mismatch → score spécialité 0', () => {
    const c = calculateScore(
      makeBrief({ speciality: 'luxe' }),
      makeConseiller(), // n'a pas 'luxe'
      CENTROIDS,
    );
    expect(c.speciality).toBe(0);
  });

  it('FR-009b : FSA voyageur null → score géo neutre 0.50', () => {
    const c = calculateScore(makeBrief({ voyageurFsa: null }), makeConseiller(), CENTROIDS);
    expect(c.geo).toBe(0.5);
  });

  it('FSA conseiller null (FR-009c) → score géo neutre 0.50', () => {
    const c = calculateScore(makeBrief(), makeConseiller({ fsa: null }), CENTROIDS);
    expect(c.geo).toBe(0.5);
  });

  it('familiarité : novice ↔ mentor = match parfait (1.0)', () => {
    const c = calculateScore(
      makeBrief({ familiarity: 'first_big_trip' }),
      makeConseiller({ experienceTier: 'mentor' }),
      CENTROIDS,
    );
    expect(c.familiarity).toBe(1);
  });

  it('familiarité : novice ↔ pair_junior = match faible (0.3)', () => {
    const c = calculateScore(
      makeBrief({ familiarity: 'first_big_trip' }),
      makeConseiller({ experienceTier: 'pair_junior' }),
      CENTROIDS,
    );
    expect(c.familiarity).toBe(0.3);
  });

  it('familiarité : expert ↔ mentor = match partiel (0.5)', () => {
    const c = calculateScore(
      makeBrief({ familiarity: 'experienced_traveler' }),
      makeConseiller({ experienceTier: 'mentor' }),
      CENTROIDS,
    );
    expect(c.familiarity).toBe(0.5);
  });

  it('SC-002 déterminisme : 2 appels identiques → mêmes composantes', () => {
    const c1 = calculateScore(makeBrief(), makeConseiller(), CENTROIDS);
    const c2 = calculateScore(makeBrief(), makeConseiller(), CENTROIDS);
    expect(c1.destination).toBe(c2.destination);
    expect(c1.geo).toBe(c2.geo);
    expect(c1.speciality).toBe(c2.speciality);
    expect(c1.familiarity).toBe(c2.familiarity);
  });
});
