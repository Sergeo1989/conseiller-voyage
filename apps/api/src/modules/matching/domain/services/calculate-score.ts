// T045 [TDD GREEN] — Service calculateScore (fonction pure 4 axes).
// Cf. ADR-0020 : destination 0.35 + geo 0.25 + speciality 0.25 + familiarity 0.15.
// La langue est un filtre dur AVANT scoring (Q3) — non re-vérifiée ici.
//
// Mapping familiarité voyageur ↔ tier conseiller (R1 research) :
//   first_big_trip   ↔ mentor       = 1.0  (match parfait : novice + mentor)
//   first_big_trip   ↔ pair         = 0.5  (acceptable)
//   first_big_trip   ↔ pair_junior  = 0.3  (faible : pair junior peut manquer d'expérience)
//   occasional       ↔ pair         = 1.0  (pair-à-pair idéal)
//   occasional       ↔ mentor       = 0.7  (sur-dimensionné mais OK)
//   occasional       ↔ pair_junior  = 0.5
//   experienced      ↔ pair         = 1.0  (pair-à-pair expérimenté)
//   experienced      ↔ pair_junior  = 0.3  (mismatch — voyageur expert ne veut pas un junior)
//   experienced      ↔ mentor       = 0.5  (sur-dimensionné, voyageur expert préfère pair)

import type {
  BriefSnapshot,
  TravelFamiliarity,
} from '../../application/ports/brief-snapshot-reader.port';
import type {
  ConseillerExperienceTier,
  ConseillerSnapshot,
} from '../../application/ports/conseiller-snapshot-reader.port';
import type { FsaCentroidTable } from '../../application/ports/fsa-centroid-reader.port';
import { ScoreComponents } from '../value-objects/score-components.vo';
import { computeFsaDistance, distanceToGeoScore } from './compute-fsa-distance';

export function calculateScore(
  brief: BriefSnapshot,
  conseiller: ConseillerSnapshot,
  centroids: FsaCentroidTable,
): ScoreComponents {
  const destination = scoreDestination(brief, conseiller);
  const geo = scoreGeo(brief, conseiller, centroids);
  const speciality = scoreSpeciality(brief, conseiller);
  const familiarity = scoreFamiliarity(brief.familiarity, conseiller.experienceTier);
  return ScoreComponents.create({ destination, geo, speciality, familiarity });
}

function scoreDestination(brief: BriefSnapshot, conseiller: ConseillerSnapshot): number {
  const conseillerCountries = new Set(conseiller.destinations.map((d) => d.country));
  const briefCountries = brief.destinations.map((d) => d.country);
  const hasMatch = briefCountries.some((c) => conseillerCountries.has(c));
  return hasMatch ? 1 : 0;
}

function scoreGeo(
  brief: BriefSnapshot,
  conseiller: ConseillerSnapshot,
  centroids: FsaCentroidTable,
): number {
  if (brief.voyageurFsa === null || conseiller.fsa === null) {
    return 0.5; // FR-009b / FR-009c — score géo neutre médian
  }
  const distance = computeFsaDistance(brief.voyageurFsa, conseiller.fsa, centroids);
  return distanceToGeoScore(distance).value;
}

function scoreSpeciality(brief: BriefSnapshot, conseiller: ConseillerSnapshot): number {
  const hasMatch = conseiller.specialities.includes(brief.speciality);
  return hasMatch ? 1 : 0;
}

const FAMILIARITY_MATRIX: Readonly<
  Record<TravelFamiliarity, Readonly<Record<ConseillerExperienceTier, number>>>
> = {
  first_big_trip: {
    mentor: 1.0,
    pair: 0.5,
    pair_junior: 0.3,
  },
  occasional_traveler: {
    mentor: 0.7,
    pair: 1.0,
    pair_junior: 0.5,
  },
  experienced_traveler: {
    mentor: 0.5,
    pair: 1.0,
    pair_junior: 0.3,
  },
};

function scoreFamiliarity(
  familiarity: TravelFamiliarity,
  experienceTier: ConseillerExperienceTier,
): number {
  return FAMILIARITY_MATRIX[familiarity][experienceTier];
}
