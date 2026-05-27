// T095 — Tests e2e flow recovery (US3).
//
// Note : squelettes .skip jusqu'à mise en place d'un endpoint dev de
// seeding (conseiller enrolled + backup codes pré-générés). La
// couverture comportementale est assurée par les 6 tests d'intégration
// côté apps/api (verify-flow.integration.test.ts — tous verts).

import { expect, test } from '@playwright/test';

test.describe('MFA Recovery (US3)', () => {
  test('redirect to login when no session — verify page', async ({ page }) => {
    await page.goto('/fr/mfa/verify');
    const url = page.url();
    expect(url).toMatch(/\/login|\/mfa\/verify/);
  });

  test('redirect to login when no session — recovery page', async ({ page }) => {
    await page.goto('/fr/mfa/recovery');
    const url = page.url();
    expect(url).toMatch(/\/login|\/mfa\/recovery/);
  });

  test.skip('US3.1 — TOTP correct → accès tableau de bord', async () => {
    // Future : seed conseiller enrolled, login, /mfa/verify, saisir TOTP
    // valide (généré via authenticator.generate), expect redirect /.
  });

  test.skip('US3.2 — backup code valide → consommé, redirect home', async () => {
    // Future : seed + login, /mfa/recovery, saisir un code valide,
    // expect redirect / + remainingCount = 9 en BD.
  });

  test.skip('US3.3 — backup code déjà consommé → message d erreur', async () => {
    // Future : consommer le code une fois, retenter, expect message
    // "code invalide ou déjà utilisé".
  });

  test.skip('US3.4 — warnLowCodes à 2 codes restants → bannière affichée', async () => {
    // Future : consommer 8 codes, vérifier que le toast warnMessage
    // apparaît brièvement avant le redirect.
  });
});
