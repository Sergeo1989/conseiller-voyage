// T022 — Tests Vitest computeCircuitState + isCallAllowed.

import { describe, expect, test } from 'vitest';
import {
  type CircuitState,
  INITIAL_CIRCUIT_STATE,
  computeCircuitState,
  isCallAllowed,
} from '../compute-circuit-state';

const T0 = new Date('2026-05-28T12:00:00.000Z');

function plusMs(ms: number): Date {
  return new Date(T0.getTime() + ms);
}

describe('computeCircuitState — feature 003', () => {
  test('état initial : closed sans échecs', () => {
    expect(INITIAL_CIRCUIT_STATE).toEqual({ kind: 'closed', failuresInWindow: [] });
  });

  test('closed + 1 succès → reset failures', () => {
    const state = computeCircuitState(
      { kind: 'closed', failuresInWindow: [T0] },
      { type: 'success' },
      plusMs(100),
    );
    expect(state).toEqual({ kind: 'closed', failuresInWindow: [] });
  });

  test('closed + 1 failure → reste closed, ajoute à la fenêtre', () => {
    const state = computeCircuitState(INITIAL_CIRCUIT_STATE, { type: 'failure' }, T0);
    expect(state.kind).toBe('closed');
    if (state.kind === 'closed') {
      expect(state.failuresInWindow).toHaveLength(1);
    }
  });

  test('closed + 5 failures dans 60 s → open', () => {
    let state: CircuitState = INITIAL_CIRCUIT_STATE;
    for (let i = 0; i < 4; i++) {
      state = computeCircuitState(state, { type: 'failure' }, plusMs(i * 1000));
    }
    expect(state.kind).toBe('closed');
    state = computeCircuitState(state, { type: 'failure' }, plusMs(5_000));
    expect(state.kind).toBe('open');
    if (state.kind === 'open') {
      expect(state.openedAt).toEqual(plusMs(5_000));
    }
  });

  test('closed + échecs espacés > 60 s → fenêtre glissante, ne ouvre PAS', () => {
    let state: CircuitState = INITIAL_CIRCUIT_STATE;
    // 5 échecs espacés de 20 s ; le 1er sort de fenêtre quand le 5e arrive
    state = computeCircuitState(state, { type: 'failure' }, plusMs(0));
    state = computeCircuitState(state, { type: 'failure' }, plusMs(20_000));
    state = computeCircuitState(state, { type: 'failure' }, plusMs(40_000));
    state = computeCircuitState(state, { type: 'failure' }, plusMs(61_000));
    state = computeCircuitState(state, { type: 'failure' }, plusMs(82_000));
    expect(state.kind).toBe('closed');
    if (state.kind === 'closed') {
      // Les échecs aux instants 0 et 20_000 sont sortis de la fenêtre
      // (now=82_000, window=60_000 → ne garde que les ≥ 22_000).
      expect(state.failuresInWindow.length).toBeLessThanOrEqual(4);
    }
  });

  test('open avant 30 s → reste open', () => {
    const state = computeCircuitState(
      { kind: 'open', openedAt: T0 },
      { type: 'failure' },
      plusMs(15_000),
    );
    expect(state).toEqual({ kind: 'open', openedAt: T0 });
  });

  test('open après 30 s + succès → closed', () => {
    const state = computeCircuitState(
      { kind: 'open', openedAt: T0 },
      { type: 'success' },
      plusMs(31_000),
    );
    expect(state).toEqual({ kind: 'closed', failuresInWindow: [] });
  });

  test('open après 30 s + failure → open (recyclé openedAt = now)', () => {
    const state = computeCircuitState(
      { kind: 'open', openedAt: T0 },
      { type: 'failure' },
      plusMs(31_000),
    );
    expect(state.kind).toBe('open');
    if (state.kind === 'open') {
      expect(state.openedAt).toEqual(plusMs(31_000));
    }
  });

  test('half-open + succès → closed', () => {
    const state = computeCircuitState({ kind: 'half-open' }, { type: 'success' }, T0);
    expect(state).toEqual({ kind: 'closed', failuresInWindow: [] });
  });

  test('half-open + failure → open', () => {
    const state = computeCircuitState({ kind: 'half-open' }, { type: 'failure' }, T0);
    expect(state).toEqual({ kind: 'open', openedAt: T0 });
  });
});

describe('isCallAllowed', () => {
  test('closed → autorisé', () => {
    expect(isCallAllowed(INITIAL_CIRCUIT_STATE, T0)).toBe(true);
  });

  test('half-open → autorisé', () => {
    expect(isCallAllowed({ kind: 'half-open' }, T0)).toBe(true);
  });

  test('open avant 30 s → refusé', () => {
    expect(isCallAllowed({ kind: 'open', openedAt: T0 }, plusMs(15_000))).toBe(false);
  });

  test('open après 30 s → autorisé (passage implicite half-open)', () => {
    expect(isCallAllowed({ kind: 'open', openedAt: T0 }, plusMs(31_000))).toBe(true);
  });
});
