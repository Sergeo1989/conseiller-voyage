// T027 [TDD GREEN] — Value Object TravelBudget.
// FR-005 : 5 fourchettes canoniques CAD. Aligné sur enum Prisma + Zod.

export const TRAVEL_BUDGETS = [
  'under_2k',
  'between_2k_5k',
  'between_5k_10k',
  'between_10k_20k',
  'above_20k',
] as const;

export type TravelBudget = (typeof TRAVEL_BUDGETS)[number];

/** Parse strict — lance Error si la valeur n'est pas une des 5 canoniques. */
export function fromString(value: TravelBudget | string): TravelBudget {
  if ((TRAVEL_BUDGETS as ReadonlyArray<string>).includes(value)) {
    return value as TravelBudget;
  }
  throw new Error(`TravelBudget invalide : ${JSON.stringify(value)}`);
}
