// T029 [TDD GREEN] — Value Object TravelSpeciality.
// FR-007 : 11 valeurs canoniques. 'autre' exige une précision libre.

export const TRAVEL_SPECIALITIES = [
  'croisiere',
  'aventure_outdoor',
  'lune_de_miel',
  'famille_avec_enfants',
  'mobilite_reduite',
  'multigenerationnel',
  'culturel_historique',
  'luxe',
  'road_trip',
  'voyage_affaires',
  'autre',
] as const;

export type TravelSpeciality = (typeof TRAVEL_SPECIALITIES)[number];

export function fromString(value: TravelSpeciality | string): TravelSpeciality {
  if ((TRAVEL_SPECIALITIES as ReadonlyArray<string>).includes(value)) {
    return value as TravelSpeciality;
  }
  throw new Error(`TravelSpeciality invalide : ${JSON.stringify(value)}`);
}

/** Vrai si la spécialité exige un texte libre `specialityOther` (FR-007). */
export function needsOtherDetail(speciality: TravelSpeciality): boolean {
  return speciality === 'autre';
}
