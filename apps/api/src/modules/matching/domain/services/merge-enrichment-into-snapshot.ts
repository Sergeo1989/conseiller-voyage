// T013 [016 US1] [TDD GREEN] — Fusion intentions enrichies → entrée de scoring.
//
// Fonction PURE (Principe VI). Le déterministe (brief 008) PRÉVAUT toujours
// (FR-003) ; l'enrichi n'est utilisé que sous seuil de confiance et statut
// `enrichi`. Vit côté matching (propriétaire de `BriefSnapshot` + des règles de
// scoring). Le scoring lui-même (poids, plafond 3, filtre `verified`) n'est PAS
// touché — seule l'ENTRÉE est résolue.
//
// US1 : résolution de `speciality = 'autre'` → spécialité canonique.
// US2 : union des destinations (déterministes TOUJOURS conservées, jamais écrasées).

import { ENRICHMENT_CONFIDENCE_THRESHOLD } from '@cv/shared/intake';
import type {
  BriefSnapshot,
  TravelSpeciality,
} from '../../application/ports/brief-snapshot-reader.port';

export { ENRICHMENT_CONFIDENCE_THRESHOLD };

export interface EnrichmentForScoring {
  readonly status: 'enrichi' | 'partiel' | 'non_enrichi' | 'indisponible';
  readonly enrichedSpeciality: Exclude<TravelSpeciality, 'autre'> | null;
  readonly enrichedDestinations: ReadonlyArray<string>; // ISO-3166-1 alpha-2 (US2)
  readonly confidence: number;
}

/** Renvoie un snapshot dont l'entrée de scoring peut être enrichie. Pure. */
export function mergeEnrichmentIntoSnapshot(
  snapshot: BriefSnapshot,
  enrichment: EnrichmentForScoring | null,
): BriefSnapshot {
  // Enrichi inutilisable → déterministe tel quel (mode dégradé, FR-002/013).
  if (
    !enrichment ||
    enrichment.status !== 'enrichi' ||
    enrichment.confidence < ENRICHMENT_CONFIDENCE_THRESHOLD
  ) {
    return snapshot;
  }

  // Spécialité : le déterministe prévaut ; on ne résout que `autre` (FR-003).
  const speciality: TravelSpeciality =
    snapshot.speciality === 'autre' && enrichment.enrichedSpeciality !== null
      ? enrichment.enrichedSpeciality
      : snapshot.speciality;

  return {
    ...snapshot,
    speciality,
    destinations: unionDestinations(snapshot, enrichment.enrichedDestinations),
  };
}

// Augmente l'ensemble de destinations : déterministes TOUJOURS conservées,
// enrichies ajoutées seulement si absentes (dédup vs déterministe ET entre elles,
// ordre stable). N'écrase/ne retire jamais une destination déterministe (FR-003).
function unionDestinations(
  snapshot: BriefSnapshot,
  enrichedDestinations: ReadonlyArray<string>,
): BriefSnapshot['destinations'] {
  const seen = new Set(snapshot.destinations.map((d) => d.country));
  const added: Array<{ readonly country: string }> = [];
  for (const country of enrichedDestinations) {
    if (!seen.has(country)) {
      seen.add(country);
      added.push({ country });
    }
  }
  return added.length > 0 ? [...snapshot.destinations, ...added] : snapshot.destinations;
}
