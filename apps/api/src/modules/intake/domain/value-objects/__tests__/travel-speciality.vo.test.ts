// T028 [TDD RED] — Tests TravelSpecialityVo.
// FR-007 : 11 valeurs canoniques + 'autre' avec précision libre ≤ 200 chars.

import { describe, expect, it } from 'vitest';
import {
  TRAVEL_SPECIALITIES,
  type TravelSpeciality,
  fromString,
  needsOtherDetail,
} from '../travel-speciality.vo';

describe('TravelSpecialityVo.fromString', () => {
  it('accepte les 11 valeurs canoniques', () => {
    for (const s of TRAVEL_SPECIALITIES) {
      expect(fromString(s)).toBe(s);
    }
  });

  it('refuse une valeur hors enum', () => {
    expect(() => fromString('extreme_sport' as TravelSpeciality)).toThrow();
  });

  it('TRAVEL_SPECIALITIES contient exactement 11 valeurs (FR-007)', () => {
    expect(TRAVEL_SPECIALITIES).toHaveLength(11);
  });

  it('"autre" est dans la liste', () => {
    expect(TRAVEL_SPECIALITIES).toContain('autre');
  });
});

describe('TravelSpecialityVo.needsOtherDetail', () => {
  it('renvoie true pour "autre"', () => {
    expect(needsOtherDetail('autre')).toBe(true);
  });

  it('renvoie false pour les 10 spécialités fermées', () => {
    for (const s of TRAVEL_SPECIALITIES.filter((x) => x !== 'autre')) {
      expect(needsOtherDetail(s)).toBe(false);
    }
  });
});
