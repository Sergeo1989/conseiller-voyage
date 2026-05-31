// T042 [TDD RED] — Tests computeFsaDistance + distanceToGeoScore.
// Cf. ADR-0021 : Haversine sur centroïdes FSA + 5 paliers de score géo.

import { describe, expect, it } from 'vitest';
import type { FsaCentroidTable } from '../../../application/ports/fsa-centroid-reader.port';
import { asFsaCode } from '../../value-objects/fsa-code.vo';
import { computeFsaDistance, distanceToGeoScore } from '../compute-fsa-distance';

// Mini table fixture pour tests (sample multi-provincial)
const TEST_CENTROIDS: FsaCentroidTable = new Map([
  [asFsaCode('H7N'), { lat: 45.5736, lng: -73.7239, province: 'QC' as const }], // Laval-Ouest
  [asFsaCode('H2X'), { lat: 45.5125, lng: -73.5658, province: 'QC' as const }], // Plateau Mont-Royal
  [asFsaCode('M5V'), { lat: 43.6435, lng: -79.3954, province: 'ON' as const }], // Toronto centre
  [asFsaCode('V6B'), { lat: 49.2812, lng: -123.1207, province: 'BC' as const }], // Vancouver
]);

describe('computeFsaDistance', () => {
  it('retourne 0 km pour la même FSA', () => {
    const d = computeFsaDistance(asFsaCode('H7N'), asFsaCode('H7N'), TEST_CENTROIDS);
    expect(d).toBe(0);
  });

  it('retourne ~15 km entre H7N (Laval) et H2X (Plateau) — voisins proches', () => {
    const d = computeFsaDistance(asFsaCode('H7N'), asFsaCode('H2X'), TEST_CENTROIDS);
    expect(d).not.toBeNull();
    if (d === null) throw new Error('unreachable — assert above');
    expect(d).toBeGreaterThan(10);
    expect(d).toBeLessThan(25);
  });

  it('retourne ~500 km entre H2X (MTL) et M5V (TO)', () => {
    const d = computeFsaDistance(asFsaCode('H2X'), asFsaCode('M5V'), TEST_CENTROIDS);
    expect(d).not.toBeNull();
    if (d === null) throw new Error('unreachable — assert above');
    expect(d).toBeGreaterThan(450);
    expect(d).toBeLessThan(600);
  });

  it('retourne ~3700 km entre H2X (MTL) et V6B (Vancouver)', () => {
    const d = computeFsaDistance(asFsaCode('H2X'), asFsaCode('V6B'), TEST_CENTROIDS);
    expect(d).not.toBeNull();
    if (d === null) throw new Error('unreachable — assert above');
    expect(d).toBeGreaterThan(3500);
    expect(d).toBeLessThan(4000);
  });

  it('retourne null si FSA absent de la table (fixture incomplet ou inconnu)', () => {
    expect(computeFsaDistance(asFsaCode('Z9Z'), asFsaCode('H7N'), TEST_CENTROIDS)).toBeNull();
    expect(computeFsaDistance(asFsaCode('H7N'), asFsaCode('Z9Z'), TEST_CENTROIDS)).toBeNull();
  });

  it('est commutatif (a→b = b→a, SC-002 déterminisme)', () => {
    const ab = computeFsaDistance(asFsaCode('H2X'), asFsaCode('M5V'), TEST_CENTROIDS);
    const ba = computeFsaDistance(asFsaCode('M5V'), asFsaCode('H2X'), TEST_CENTROIDS);
    expect(ab).toBe(ba);
  });
});

describe('distanceToGeoScore (5 paliers ADR-0021)', () => {
  it('0 km → 1.00 (même FSA)', () => {
    expect(distanceToGeoScore(0).value).toBe(1);
  });

  it('20 km → 0.80 (0-25 km)', () => {
    expect(distanceToGeoScore(20).value).toBe(0.8);
  });

  it('50 km → 0.50 (25-100 km)', () => {
    expect(distanceToGeoScore(50).value).toBe(0.5);
  });

  it('300 km → 0.20 (100-500 km)', () => {
    expect(distanceToGeoScore(300).value).toBe(0.2);
  });

  it('1000 km → 0.05 (> 500 km)', () => {
    expect(distanceToGeoScore(1000).value).toBe(0.05);
  });

  it('borne exacte 25 km → 0.80 (palier inclusif inférieur)', () => {
    expect(distanceToGeoScore(25).value).toBe(0.8);
  });

  it('borne exacte 100 km → 0.50', () => {
    expect(distanceToGeoScore(100).value).toBe(0.5);
  });

  it('borne exacte 500 km → 0.20', () => {
    expect(distanceToGeoScore(500).value).toBe(0.2);
  });

  it('FR-009b : distance null → score neutre médian 0.50', () => {
    expect(distanceToGeoScore(null).value).toBe(0.5);
  });
});
