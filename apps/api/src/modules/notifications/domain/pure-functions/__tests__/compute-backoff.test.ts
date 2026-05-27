// T020 — Tests Vitest computeBackoff + shouldMoveToDeadLetter.

import { describe, expect, test } from 'vitest';
import { MAX_ATTEMPTS, computeBackoff, shouldMoveToDeadLetter } from '../compute-backoff';

const NOW = new Date('2026-05-28T12:00:00.000Z');

describe('computeBackoff — feature 003', () => {
  test('attempt 1 → +60 s', () => {
    const next = computeBackoff(1, NOW);
    expect(next.getTime() - NOW.getTime()).toBe(60 * 1000);
  });

  test('attempt 2 → +5 min', () => {
    const next = computeBackoff(2, NOW);
    expect(next.getTime() - NOW.getTime()).toBe(5 * 60 * 1000);
  });

  test('attempt 3 → +30 min', () => {
    const next = computeBackoff(3, NOW);
    expect(next.getTime() - NOW.getTime()).toBe(30 * 60 * 1000);
  });

  test('attempt 4 → +4 h', () => {
    const next = computeBackoff(4, NOW);
    expect(next.getTime() - NOW.getTime()).toBe(4 * 60 * 60 * 1000);
  });

  test('attempt 5 → +24 h', () => {
    const next = computeBackoff(5, NOW);
    expect(next.getTime() - NOW.getTime()).toBe(24 * 60 * 60 * 1000);
  });

  test('attempt 6 lève (MAX_ATTEMPTS dépassé)', () => {
    expect(() => computeBackoff(6, NOW)).toThrow(/MAX_ATTEMPTS=5/);
  });

  test('attempt 0 ou négatif lève', () => {
    expect(() => computeBackoff(0, NOW)).toThrow(/must be >= 1/);
    expect(() => computeBackoff(-1, NOW)).toThrow(/must be >= 1/);
  });

  test('clock injection — différents NOW produisent différents nextAttemptAt', () => {
    const otherNow = new Date('2026-06-01T00:00:00.000Z');
    expect(computeBackoff(1, NOW)).not.toEqual(computeBackoff(1, otherNow));
  });
});

describe('shouldMoveToDeadLetter — borne max 5', () => {
  test('< 5 → false', () => {
    expect(shouldMoveToDeadLetter(0)).toBe(false);
    expect(shouldMoveToDeadLetter(1)).toBe(false);
    expect(shouldMoveToDeadLetter(4)).toBe(false);
  });

  test('= 5 → true (dead-letter)', () => {
    expect(shouldMoveToDeadLetter(5)).toBe(true);
  });

  test('> 5 → true', () => {
    expect(shouldMoveToDeadLetter(6)).toBe(true);
    expect(shouldMoveToDeadLetter(100)).toBe(true);
  });

  test('MAX_ATTEMPTS exposé = 5', () => {
    expect(MAX_ATTEMPTS).toBe(5);
  });
});
