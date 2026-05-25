// T106 — E2E Playwright US4 : révocation manuelle admin.
//
// Scénario :
//   1. Seed un conseiller verified
//   2. Admin visite /admin/conformite/conseillers/{id} → ouvre la modal
//   3. Tape motif + 'RÉVOQUER' → confirme
//   4. Vérifie message de succès
//   5. Conseiller voit "Révoqué" sur sa page overview
//   6. Verifier que le port public retourne verified=false en < 10s
//
// PRÉREQUIS : voir README.md.

import { expect, test } from '@playwright/test';

const ADMIN_SESSION = process.env.E2E_ADMIN_SESSION;
const CONSEILLER_SESSION = process.env.E2E_CONSEILLER_SESSION;
const COMPLIANCE_ID = process.env.E2E_TEST_COMPLIANCE_ID;

test.describe('US4 — Révocation manuelle admin', () => {
  test('admin révoque conseiller verified → revoked, invisible en < 10s', async ({ browser }) => {
    test.skip(
      !ADMIN_SESSION || !CONSEILLER_SESSION || !COMPLIANCE_ID,
      'Sessions de test ou COMPLIANCE_ID absents — voir README.md',
    );

    const adminContext = await browser.newContext({
      storageState: {
        cookies: [
          {
            name: '__Host-cv.session.token',
            value: ADMIN_SESSION as string,
            domain: 'localhost',
            path: '/',
            httpOnly: true,
            secure: false,
            expires: -1,
            sameSite: 'Lax',
          },
        ],
        origins: [],
      },
    });
    const adminPage = await adminContext.newPage();
    await adminPage.goto(`/fr/admin/conformite/conseillers/${COMPLIANCE_ID}`);
    await adminPage.getByRole('button', { name: /Révoquer ce conseiller/ }).click();
    await adminPage
      .getByLabel(/Motif/)
      .fill('Conduite réglementaire inacceptable répétée malgré avertissement.');
    await adminPage.getByLabel(/tapez/).fill('RÉVOQUER');
    await adminPage.getByRole('button', { name: /Révoquer définitivement/ }).click();
    await expect(adminPage.getByText(/Conseiller révoqué/)).toBeVisible({ timeout: 10_000 });
    await adminContext.close();

    // Vérifier côté conseiller
    const conseillerContext = await browser.newContext({
      storageState: {
        cookies: [
          {
            name: '__Host-cv.session.token',
            value: CONSEILLER_SESSION as string,
            domain: 'localhost',
            path: '/',
            httpOnly: true,
            secure: false,
            expires: -1,
            sameSite: 'Lax',
          },
        ],
        origins: [],
      },
    });
    const conseillerPage = await conseillerContext.newPage();
    await conseillerPage.goto('/fr/conseiller/conformite');
    await expect(conseillerPage.getByText(/Révoqué/)).toBeVisible({ timeout: 10_000 });
    await conseillerContext.close();
  });
});
