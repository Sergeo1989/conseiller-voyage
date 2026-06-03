// T071 — Integration test boost cookie cv_suggested (US2 P2).
//
// Scenario 2 quickstart : conseiller B classé 4e en brut promu top 3
// grâce au boost +10 % cookie.
//
// SKIP : nécessite un helper de seed conseillers vérifiés + statut
// ConformiteQueryPort (mêmes prérequis que T064 scénario 1 reporté).
// Le boost logique est intégralement couvert par les tests unit :
//   - apply-boost.test.ts (7 cas)
//   - perform-matching.use-case.test.ts (4 cas boost)
// + invariant SC-004 (scoreFinal ≤ scoreBrut × 1.10) testé.
//
// Le storage end-to-end (cookie → use case → DB → matching) sera couvert
// par le smoke manuel quickstart scénario 2 en T101b (k6 charge staging).

import { describe, it } from 'vitest';

describe.skip('Boost cookie cv_suggested (integration)', () => {
  it.todo('scénario 2 quickstart : B 4e brut promu top 3 grâce au boost');
  it.todo('scénario 2 negative : suggestedConseillerId pointing au non-éligible → no-op');
  // TODO Phase 6 polish T101b — implémenter avec helper seed conseillers.
});
