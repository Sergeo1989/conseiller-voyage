// Garde de synchronisation (review #27) : `WRITABLE_NEXT` doit couvrir
// EXACTEMENT les états canoniques `LEAD_STATES` de `@cv/shared/matching`.
// `LeadState` est désormais importé (et non recopié) — `Record<LeadState, …>`
// fournit déjà la garde de compilation ; ce test verrouille aussi le runtime
// et documente l'invariant (états terminaux = aucune action).

import { LEAD_STATES, TERMINAL_LEAD_STATES } from '@cv/shared/matching';
import { describe, expect, it } from 'vitest';
import { WRITABLE_NEXT } from '../schemas/lead';

describe('WRITABLE_NEXT reste aligné sur les états canoniques', () => {
  it('a exactement une entrée par LeadState canonique', () => {
    expect(Object.keys(WRITABLE_NEXT).sort()).toEqual([...LEAD_STATES].sort());
  });

  it('les états terminaux n’exposent aucune action', () => {
    for (const state of TERMINAL_LEAD_STATES) {
      expect(WRITABLE_NEXT[state]).toEqual([]);
    }
  });
});
