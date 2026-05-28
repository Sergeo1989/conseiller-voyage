// T026 [TDD RED] — Tests TravelBudgetVo.
// FR-005 : 5 valeurs canoniques. Refus de toute autre chaîne.

import { describe, expect, it } from 'vitest';
import { TRAVEL_BUDGETS, type TravelBudget, fromString } from '../travel-budget.vo';

describe('TravelBudgetVo.fromString', () => {
  it('accepte les 5 valeurs canoniques', () => {
    for (const b of TRAVEL_BUDGETS) {
      expect(fromString(b)).toBe(b);
    }
  });

  it('refuse une valeur hors enum', () => {
    expect(() => fromString('between_100k_200k' as TravelBudget)).toThrow();
  });

  it('refuse une chaîne vide', () => {
    expect(() => fromString('' as TravelBudget)).toThrow();
  });

  it('refuse une casse différente', () => {
    expect(() => fromString('UNDER_2K' as TravelBudget)).toThrow();
  });

  it('TRAVEL_BUDGETS contient exactement 5 valeurs (FR-005)', () => {
    expect(TRAVEL_BUDGETS).toHaveLength(5);
  });
});
