// T033 [US3] — Test d'intégration durcissement (quickstart 014, SC-004/006/007).
//
// Convention 011/012 : stub documenté ; l'exécution réelle (Postgres + Redis +
// S3 via Testcontainers/LocalStack/staging) est déférée — la logique métier est
// déjà couverte par les tests unitaires avec fakes :
//   - send-message.authz.test.ts (verified dynamique, lead refusé/perdu → lecture seule)
//   - anonymize-conversation.use-case.test.ts (cascade Loi 25, audit préservé, idempotent)
//
// Couverture intégration visée (sur infra réelle) :

import { describe, it } from 'vitest';

describe.skip('Conversation resilience (integration — staging/LocalStack)', () => {
  it.todo('conseiller révoqué après ouverture → écriture refusée [FR-008]');
  it.todo('lead refusé/perdu → fil en lecture seule, lecture toujours possible [SC-004]');
  it.todo('anonymisation Loi 25 → corps null + objets S3 supprimés, audit présent [FR-011]');
  it.todo('panne SES → reprise via outbox/BullMQ, aucun doublon perçu [SC-002]');
  it.todo('ConversationQueryPort : writable dérivé correct + cloisonnement membre [SC-007]');
});
