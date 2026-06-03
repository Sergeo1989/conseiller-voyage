// T085 — Integration test MatchingQueryPort (FR-015 US3).
//
// Vérifie le filtre dynamique verified via ConformiteQueryPort réel :
//   - getByBriefIdForVoyageur exclut les conseillers révoqués post-calcul
//   - getByBriefIdForAdmin retourne tout l'historique exact + currentVerifiedStatus
//
// SKIP : Testcontainers + seed conformite réel requis.

import { describe, it } from 'vitest';

describe.skip('MatchingQueryPort filter dynamic verified (integration)', () => {
  it.todo('voyageur view filtre les conseillers révoqués');
  it.todo('admin view inclut tous + currentVerifiedStatus annoté');
});
