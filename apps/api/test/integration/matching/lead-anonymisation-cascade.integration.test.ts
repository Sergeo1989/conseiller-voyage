// T052 — Integration test US3 : cascade anonymisation Loi 25. Quickstart S8.
//
// SKIP : Testcontainers + seed (brief + leads + transitions). Validation en
// staging. Pattern hérité 011 (anonymisation-cascade.integration.test.ts).

import { describe, it } from 'vitest';

describe.skip('Lead anonymisation cascade US3 (integration)', () => {
  // S8 — anonymisation (R6, FR-009)
  it.todo('brief → status anonymized : trigger met leads.brief_id = NULL (cascade)');
  it.todo('lead_transitions INTACTE (audit préservé, SC-004)');
  it.todo('getBriefLeadsSummary(briefId) → null après anonymisation');
});
