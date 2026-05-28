// T031 [TDD GREEN] — Value Object TravelFamiliarity.
// FR-008 : 3 valeurs canoniques (premier grand voyage / occasionnel / expérimenté).

export const TRAVEL_FAMILIARITIES = [
  'first_big_trip',
  'occasional_traveler',
  'experienced_traveler',
] as const;

export type TravelFamiliarity = (typeof TRAVEL_FAMILIARITIES)[number];

export function fromString(value: TravelFamiliarity | string): TravelFamiliarity {
  if ((TRAVEL_FAMILIARITIES as ReadonlyArray<string>).includes(value)) {
    return value as TravelFamiliarity;
  }
  throw new Error(`TravelFamiliarity invalide : ${JSON.stringify(value)}`);
}
