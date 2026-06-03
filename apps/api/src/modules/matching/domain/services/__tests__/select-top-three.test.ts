// T046 [TDD RED] — Tests selectTopThree (sort + plafond 3 + status derivation).
// Plafond 3 STRICT (SC-003 invariant). Tie-breaking par conseillerId
// alphabétique pour garantir SC-002 (déterminisme).

import { describe, expect, it } from 'vitest';
import { Score } from '../../value-objects/score.vo';
import { type ScoredConseiller, selectTopThree } from '../select-top-three';

function scored(conseillerId: string, finalValue: number, brutValue?: number): ScoredConseiller {
  return {
    conseillerId,
    scoreBrut: Score.fromNumber(brutValue ?? finalValue),
    scoreFinal: Score.fromNumber(finalValue),
    components: { destination: 0, geo: 0, speciality: 0, familiarity: 0 },
    boosted: finalValue > (brutValue ?? finalValue),
  };
}

describe('selectTopThree', () => {
  it('5 conseillers → top 3 trié décroissant', () => {
    const result = selectTopThree([
      scored('id-a', 0.5),
      scored('id-b', 0.9),
      scored('id-c', 0.7),
      scored('id-d', 0.3),
      scored('id-e', 0.8),
    ]);
    expect(result.entries).toHaveLength(3);
    expect(result.entries[0]?.conseillerId).toBe('id-b'); // 0.9
    expect(result.entries[1]?.conseillerId).toBe('id-e'); // 0.8
    expect(result.entries[2]?.conseillerId).toBe('id-c'); // 0.7
    expect(result.status).toBe('ok');
    expect(result.matchedCount).toBe(3);
  });

  it('2 conseillers → status partial, matchedCount=2', () => {
    const result = selectTopThree([scored('id-a', 0.6), scored('id-b', 0.4)]);
    expect(result.entries).toHaveLength(2);
    expect(result.status).toBe('partial');
    expect(result.matchedCount).toBe(2);
  });

  it('0 conseiller → status empty, matchedCount=0', () => {
    const result = selectTopThree([]);
    expect(result.entries).toHaveLength(0);
    expect(result.status).toBe('empty');
    expect(result.matchedCount).toBe(0);
  });

  it('plafond 3 strict (SC-003) — 100 conseillers → 3 max', () => {
    const candidates = Array.from({ length: 100 }, (_, i) =>
      scored(`id-${String(i).padStart(3, '0')}`, Math.random()),
    );
    const result = selectTopThree(candidates);
    expect(result.entries).toHaveLength(3);
    expect(result.matchedCount).toBe(3);
  });

  it('positions 1/2/3 attribuées dans l ordre décroissant', () => {
    const result = selectTopThree([scored('id-a', 0.5), scored('id-b', 0.9), scored('id-c', 0.7)]);
    expect(result.entries[0]?.position).toBe(1);
    expect(result.entries[1]?.position).toBe(2);
    expect(result.entries[2]?.position).toBe(3);
  });

  it('tie-breaking par conseillerId alphabétique (SC-002 déterminisme)', () => {
    // 4 conseillers avec score identique → ordre alpha sur conseillerId garantit déterminisme
    const result = selectTopThree([
      scored('id-zzz', 0.5),
      scored('id-aaa', 0.5),
      scored('id-mmm', 0.5),
      scored('id-bbb', 0.5),
    ]);
    expect(result.entries[0]?.conseillerId).toBe('id-aaa');
    expect(result.entries[1]?.conseillerId).toBe('id-bbb');
    expect(result.entries[2]?.conseillerId).toBe('id-mmm');
  });
});
