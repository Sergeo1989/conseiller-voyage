// T032 [TDD RED] — Tests DatesFlexibilityVo.
// FR-003 : bool flexible + amplitude 1-30j conditionnel si flexible=true.

import { describe, expect, it } from 'vitest';
import { type DatesFlexibility, create, isFlexible } from '../dates-flexibility.vo';

describe('DatesFlexibilityVo.create', () => {
  it('accepte flexible=false sans amplitude', () => {
    const vo = create({ flexible: false });
    expect(vo).toEqual({ flexible: false });
  });

  it('refuse flexible=false avec amplitude (incohérent)', () => {
    expect(() => create({ flexible: false, flexibilityDays: 5 } as DatesFlexibility)).toThrow();
  });

  it('accepte flexible=true avec amplitude 1', () => {
    expect(create({ flexible: true, flexibilityDays: 1 })).toEqual({
      flexible: true,
      flexibilityDays: 1,
    });
  });

  it('accepte flexible=true avec amplitude 30', () => {
    expect(create({ flexible: true, flexibilityDays: 30 })).toEqual({
      flexible: true,
      flexibilityDays: 30,
    });
  });

  it('refuse flexible=true sans amplitude', () => {
    expect(() => create({ flexible: true } as DatesFlexibility)).toThrow();
  });

  it('refuse flexible=true avec amplitude 0', () => {
    expect(() => create({ flexible: true, flexibilityDays: 0 })).toThrow();
  });

  it('refuse flexible=true avec amplitude 31', () => {
    expect(() => create({ flexible: true, flexibilityDays: 31 })).toThrow();
  });

  it('refuse flexible=true avec amplitude non-entière', () => {
    expect(() => create({ flexible: true, flexibilityDays: 2.5 })).toThrow();
  });
});

describe('DatesFlexibilityVo.isFlexible', () => {
  it('renvoie true si flexible=true', () => {
    expect(isFlexible({ flexible: true, flexibilityDays: 5 })).toBe(true);
  });

  it('renvoie false si flexible=false', () => {
    expect(isFlexible({ flexible: false })).toBe(false);
  });
});
