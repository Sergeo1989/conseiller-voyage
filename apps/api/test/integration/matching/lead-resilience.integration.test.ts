// T053 — Integration test US3 : résilience. Quickstart S11 (all_revoked) + S12 (SES HS).
//
// SKIP : Testcontainers Postgres + Redis + SES en échec simulé. Validation en
// staging. Pattern hérité 011.

import { describe, it } from 'vitest';

describe.skip('Lead resilience US3 (integration)', () => {
  // S11 — all_matches_revoked (R10, FR-012)
  it.todo('all_matches_revoked → aucun conseiller notifié ; leads concernés → perdu');
  it.todo('pas de nouveau canal d’alerte admin créé par 012 (réutilise 008/011)');

  // S12 — SES indisponible (mode dégradé, FR-011)
  it.todo(
    'SES en échec → leads créés ; notifications failed retentées (backoff) → sent au rétablissement',
  );
  it.todo('aucun doublon perçu (idempotence destinataire)');

  // Sweep de réconciliation (mode dégradé bus HS, ADR-0026)
  it.todo('MR actif sans lead (event perdu) → sweep recrée leads + notifications');
});
