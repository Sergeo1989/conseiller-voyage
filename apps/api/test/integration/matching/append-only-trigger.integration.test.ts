// T084 — Integration test trigger append-only matching_audit_entries.
//
// Vérifie que UPDATE/DELETE/TRUNCATE sur matching_audit_entries sont
// rejetés par le trigger Postgres (migration T013 + ADR-0023).
//
// SKIP : Testcontainers requis. Pattern hérité de 001/008 integration tests
// (déjà éprouvé append-only en production).

import { describe, it } from 'vitest';

describe.skip('matching_audit_entries append-only (integration)', () => {
  it.todo('REJETTE UPDATE avec "audit log is append-only"');
  it.todo('REJETTE DELETE avec "audit log is append-only"');
  it.todo('REJETTE TRUNCATE avec "audit log is append-only"');
});
