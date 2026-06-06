// T032 — Integration test US1 : matching → leads + notifications conseiller.
// Quickstart S1 (golden path) + S2 (partial/unmatched) + S3 (non vérifié exclu)
// + dedup replay.
//
// SKIP : Testcontainers Postgres + Redis + seed cross-module (AuthUser +
// ConseillerProfile + conformite_conseiller_compliances + intake_voyageur_briefs
// + MatchingResult) + mock SES requis. Validation en staging (cf. CLAUDE.md
// « validations staging restantes »). Pattern hérité des integration tests 011
// (tous describe.skip — exécution déléguée à l'environnement staging seedé).

import { describe, it } from 'vitest';

describe.skip('Lead notifications US1 (integration)', () => {
  // S1 — golden path
  it.todo('matched (3 conseillers vérifiés) → 3 leads `envoye` + 3 notifications pending');
  it.todo('3 jobs BullMQ DISTINCTS (un par conseiller) sur la queue matching.lead-notifications');
  it.todo('aucun courriel ne contient de PII de contact voyageur (FR-004)');
  it.todo('replay du même idempotencyKey → aucun lead ni courriel supplémentaire (SC-001)');

  // S2 — partial / unmatched
  it.todo('partially_matched (2 entries) → 2 leads + 2 notifications');
  it.todo('unmatched → 0 lead, 0 notification, trace consumed_matching_events présente');

  // S3 — conseiller non vérifié au moment de la consommation
  it.todo(
    'un conseiller devenu non vérifié → notification skipped_unverified, les 2 autres notifiés',
  );
});
