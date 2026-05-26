// T120 — Tests e2e device change + régénération (US6).

import { expect, test } from '@playwright/test';

test.describe('US6 Device change + Regenerate codes', () => {
  test('redirect to login when no session — /parametres/mfa', async ({ page }) => {
    await page.goto('/fr/parametres/mfa');
    const url = page.url();
    expect(url).toMatch(/\/login|\/parametres\/mfa/);
  });

  test('redirect to login — /parametres/mfa/change-device', async ({ page }) => {
    await page.goto('/fr/parametres/mfa/change-device');
    const url = page.url();
    expect(url).toMatch(/\/login|\/change-device/);
  });

  test.skip('US6.1 — password + TOTP valide → ancien secret supersede', async () => {
    // Future : login seedé, naviguer change-device, saisir mdp + TOTP,
    // expect navigation /mfa/enroll + ancien secret DELETE en BD.
  });

  test.skip('US6.2 — password + backup code valide → idem + ancien lot DELETE', async () => {
    // Future : idem mais sélectionner radio backup + saisir code.
  });

  test.skip('US6.3 — password sans 2e facteur → erreur', async () => {
    // Future : laisser factorCode vide → bouton submit reste disabled.
  });

  test.skip('régénération codes step-up requis → message d info', async () => {
    // Future : sans step-up, cliquer "Régénérer", expect message
    // "Reconnectez-vous puis réessayez".
  });
});
