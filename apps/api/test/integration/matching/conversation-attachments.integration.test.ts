// T026 [US2] — Test d'intégration pièces jointes (quickstart 014, SC-003).
//
// Convention 011/012 : stub documenté ; l'exécution réelle (Postgres + S3 via
// Testcontainers/LocalStack/staging) est déférée — la logique métier est déjà
// couverte par les tests unitaires purs + use cases avec fakes :
//   - conversation-policy.test.ts (validateAttachment : type / poids)
//   - attachments.use-case.test.ts (upload pré-signé → finalize → URL signée,
//     autorisation membre, statuts pending→ready)
//
// Couverture intégration visée (sur DB + S3 réels) :

import { describe, it } from 'vitest';

describe.skip('Conversation attachments (integration — staging/LocalStack)', () => {
  it.todo('upload PDF pré-signé → PUT S3 → finalize → status ready [SC-003]');
  it.todo('lecture via URL signée courte (membre) ; expiration appliquée');
  it.todo('non-membre → accès refusé à l’URL de lecture');
  it.todo('type non autorisé / fichier trop volumineux → refusés avant S3 [FR-008]');
  it.todo(
    'invariant : 0 champ montant/prix/paiement/réservation sur le modèle + réponses [SC-003]',
  );
});
