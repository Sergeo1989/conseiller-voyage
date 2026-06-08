// T019 [US1] — Test d'intégration messagerie de conversation (quickstart 014).
//
// Convention 011/012 : stub documenté ; l'exécution réelle (Postgres + Redis via
// Testcontainers/staging) est déférée — la logique métier est déjà couverte par
// les tests unitaires purs + use cases avec fakes (18/18 verts) :
//   - conversation-policy.test.ts (canWrite / validateMessage / validateAttachment)
//   - send-message.use-case.test.ts (membre, canWrite, idempotence, 1 notif/destinataire)
//   - open-conversation-on-accept.use-case.test.ts (idempotent, 1 fil/lead)
//
// Couverture intégration visée (sur DB réelle) :

import { describe, it } from 'vitest';

describe.skip('Conversation messaging (integration — staging/Testcontainers)', () => {
  it.todo('lead accepté → fil ouvert (idempotent, 1 fil/lead) [SC-005]');
  it.todo(
    'envoi conseiller → message persisté ordonné + 1 notif outbox vers voyageur [SC-001/002]',
  );
  it.todo('envoi voyageur → 1 notif vers conseiller ; ordre chronologique préservé');
  it.todo('rejeu même idempotencyKey → aucun message ni notif en double [SC-009]');
  it.todo('lead non accepté → aucun fil / écriture refusée [SC-005]');
  it.todo('lead refusé/perdu → fil en lecture seule [SC-004]');
  it.todo('conseiller révoqué → écriture refusée [SC-004]');
  it.todo('cloisonnement : un conseiller n’accède jamais au fil d’un autre [SC-007]');
});
