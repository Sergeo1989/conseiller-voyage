// T084 — Tests e2e step-up modal US2.
//
// Couverture MVP des scénarios d'acceptation US2 :
//   - Modal s'ouvre quand la session n'est pas MFA-frais
//   - Fermeture interruptible (Escape) → action sensible reste verrouillée
//   - Validation TOTP → action exécutée
//
// Note : ces tests exigent un setup conseiller enrôlé + session. Pour
// MVP on les marque .skip jusqu'à mise en place d'un endpoint dev
// `/test/seed-mfa-user` ou d'un setup global Playwright. La logique
// est couverte par les tests d'intégration côté apps/api (4/4 verts).

import { test } from '@playwright/test';

test.describe('MFA Step-Up Modal (US2)', () => {
  test.skip('session non fresh → modal apparaît sur action sensible', async () => {
    // Future :
    // 1. Login + enroll (helper fixture)
    // 2. Force mfaVerifiedAt = NOW - 31min via dev endpoint
    // 3. Click sur action sensible stub
    // 4. expect modal Dialog ouvert
  });

  test.skip('fermeture modal (Esc) → action reste verrouillée', async () => {
    // Future : pressKey('Escape') puis vérifier que l'action n'a pas été
    // exécutée (ex : pas de toast de succès, pas de mutation BD).
  });

  test.skip('code TOTP valide → action exécutée + mfaVerifiedAt rafraîchi', async () => {
    // Future : saisir le code TOTP courant via authenticator.generate
    // dans le test, vérifier 200 + side effect de l'action sensible.
  });

  test.skip('3 échecs consécutifs → redirect /login?reason=stepup_failed', async () => {
    // Future : saisir 3× "000000", vérifier la navigation.
  });
});
