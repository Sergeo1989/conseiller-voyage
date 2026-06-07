// T051 — Integration test US3 : re-matching (supersession). Quickstart S7.
//
// SKIP : Testcontainers + seed (brief + MatchingResult MR#1 avec leads actifs
// + re-match 011 produisant MR#2). Validation en staging. Pattern hérité 011.

import { describe, it } from 'vitest';

describe.skip('Lead re-match supersession US3 (integration)', () => {
  // S7 — supersession (FR-018, SC-008)
  it.todo('MR#2 supersède MR#1 → leads non terminaux de MR#1 → perdu (motif re-matched)');
  it.todo(
    'nouveaux leads créés pour MR#2 ; un conseiller commun obtient un nouveau lead + notification',
  );
  it.todo('au plus UN lead actif (non terminal) par (conseiller × brief) — SC-008');
});
