// T043 [TDD GREEN] — Service computeFsaDistance + distanceToGeoScore.
// Cf. ADR-0021 : Haversine sur centroïdes FSA + 5 paliers de score géo.
// Fonctions pures, zéro I/O (Principe VI).

import type { FsaCentroidTable } from '../../application/ports/fsa-centroid-reader.port';
import type { FsaCode } from '../value-objects/fsa-code.vo';
import { Score } from '../value-objects/score.vo';

const EARTH_RADIUS_KM = 6371;

/**
 * Distance Haversine entre deux FSA via leur centroïde.
 * Retourne null si l'une des FSA est absente de la table (fixture incomplet
 * ou FSA inconnu).
 */
export function computeFsaDistance(
  a: FsaCode,
  b: FsaCode,
  centroids: FsaCentroidTable,
): number | null {
  const cA = centroids.get(a);
  const cB = centroids.get(b);
  if (!cA || !cB) return null;

  const lat1Rad = (cA.lat * Math.PI) / 180;
  const lat2Rad = (cB.lat * Math.PI) / 180;
  const deltaLatRad = ((cB.lat - cA.lat) * Math.PI) / 180;
  const deltaLngRad = ((cB.lng - cA.lng) * Math.PI) / 180;

  const haversine =
    Math.sin(deltaLatRad / 2) ** 2 +
    Math.cos(lat1Rad) * Math.cos(lat2Rad) * Math.sin(deltaLngRad / 2) ** 2;
  const angularDistance = 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));

  return EARTH_RADIUS_KM * angularDistance;
}

/**
 * Dérive un Score [0, 1] depuis une distance en km via les 5 paliers
 * ADR-0021. distance=null → score neutre médian 0.50 (FR-009b).
 */
export function distanceToGeoScore(distanceKm: number | null): Score {
  if (distanceKm === null) {
    return Score.fromNumber(0.5); // FR-009b
  }
  if (distanceKm <= 0) return Score.fromNumber(1);
  if (distanceKm <= 25) return Score.fromNumber(0.8);
  if (distanceKm <= 100) return Score.fromNumber(0.5);
  if (distanceKm <= 500) return Score.fromNumber(0.2);
  return Score.fromNumber(0.05);
}
