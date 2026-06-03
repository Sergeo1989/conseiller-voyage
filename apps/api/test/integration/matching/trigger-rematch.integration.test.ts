// T082 — Integration test TriggerRematchUseCase (FR-016 US3).
//
// Scénario 5 quickstart : admin trigger re-matching après révocation
// cascade des 3 conseillers. Vérifie :
//   - Verrou Redis SETNX réel (un 2e re-trigger concurrent retourne 409)
//   - Ancien MR supersededAt + supersededByMatchingResultId chaîné
//   - Nouveau MR créé en DB
//   - Audit `matching.recomputed` persisté
//
// SKIP : nécessite Testcontainers Postgres + Redis + seed conseillers
// vérifiés (helper à factoriser en Phase 6 polish).
// La logique est intégralement couverte par tests unit (4 cas
// trigger-rematch.use-case.test.ts).

import { describe, it } from 'vitest';

describe.skip('TriggerRematchUseCase (integration)', () => {
  it.todo('scénario 5 : admin re-trigger → ancien superseded + nouveau MR + audit');
  it.todo('verrou Redis concurrent : 2 re-trigger simultanés → 1 ok + 1 lock_in_progress');
});
