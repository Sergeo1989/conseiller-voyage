// T083 — Integration test anonymisation cascade brief → matching (ADR-0023).
//
// Scénario 6 quickstart : effacement Loi 25 d'un brief (008 FR-022) propage
// au MatchingResult via trigger Postgres :
//   - matching_results.briefId → NULL
//   - matching_results.suggestedConseillerId → NULL
//   - matching_result_entries.scoreComponents → {"redacted":"loi25"}
//   - matching_audit_entries PRÉSERVÉE (audit 7 ans Loi 25)
//
// SKIP : Testcontainers requis pour exécuter le trigger Postgres réel.

import { describe, it } from 'vitest';

describe.skip('Anonymisation cascade brief → matching (integration)', () => {
  it.todo('voyageur erase brief → MR briefId NULL + entries scoreComponents redacted');
  it.todo('matching_audit_entries préservée intacte post-cascade (Loi 25 7 ans)');
});
