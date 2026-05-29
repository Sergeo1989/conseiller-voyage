// T030 [TDD RED] — Tests TravelFamiliarityVo.
// FR-008 : 3 valeurs canoniques.

import { describe, expect, it } from 'vitest';
import { TRAVEL_FAMILIARITIES, type TravelFamiliarity, fromString } from '../travel-familiarity.vo';

describe('TravelFamiliarityVo.fromString', () => {
  it('accepte les 3 valeurs canoniques', () => {
    for (const f of TRAVEL_FAMILIARITIES) {
      expect(fromString(f)).toBe(f);
    }
  });

  it('refuse une valeur hors enum', () => {
    expect(() => fromString('jet_set' as TravelFamiliarity)).toThrow();
  });

  it('TRAVEL_FAMILIARITIES contient exactement 3 valeurs (FR-008)', () => {
    expect(TRAVEL_FAMILIARITIES).toHaveLength(3);
  });
});
