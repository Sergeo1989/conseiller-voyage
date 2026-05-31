// T038 [TDD RED] — Tests MatchingStatus VO.
// MatchingStatus = 'ok' | 'partial' | 'empty' dérivé du matchedCount
// (0 → empty, 1-2 → partial, 3 → ok). Cohérence forcée par CHECK constraint DB
// + dérivation pure côté domain.

import { describe, expect, it } from 'vitest';
import {
  type MatchingStatus,
  fromMatchedCount,
  isEmpty,
  isOk,
  isPartial,
} from '../matching-status.vo';

describe('MatchingStatus VO', () => {
  it('fromMatchedCount(0) → empty', () => {
    expect(fromMatchedCount(0)).toBe<MatchingStatus>('empty');
  });

  it('fromMatchedCount(1) → partial', () => {
    expect(fromMatchedCount(1)).toBe<MatchingStatus>('partial');
  });

  it('fromMatchedCount(2) → partial', () => {
    expect(fromMatchedCount(2)).toBe<MatchingStatus>('partial');
  });

  it('fromMatchedCount(3) → ok', () => {
    expect(fromMatchedCount(3)).toBe<MatchingStatus>('ok');
  });

  it('fromMatchedCount refuse < 0', () => {
    expect(() => fromMatchedCount(-1)).toThrow();
  });

  it('fromMatchedCount refuse > 3 (plafond 3 SC-003)', () => {
    expect(() => fromMatchedCount(4)).toThrow(/plafond|matched/i);
  });

  it('isOk / isPartial / isEmpty guards', () => {
    expect(isOk('ok')).toBe(true);
    expect(isPartial('partial')).toBe(true);
    expect(isEmpty('empty')).toBe(true);
    expect(isOk('partial')).toBe(false);
    expect(isPartial('ok')).toBe(false);
  });
});
