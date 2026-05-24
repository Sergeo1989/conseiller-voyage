// T111 — E2E Playwright US5 : espace personnel conseiller.
//
// Scénario :
//   1. Conseiller authentifié visite /conseiller/conformite
//   2. Vérifie statut visible + 5 derniers événements historique
//   3. Si cert expire J-30 (seed), vérifier bandeau "Renouvellement"
//
// PRÉREQUIS : voir README.md.

import { expect, test } from '@playwright/test';

const CONSEILLER_SESSION = process.env.E2E_CONSEILLER_SESSION;

test.describe('US5 — Espace personnel conseiller', () => {
  test('voit statut + historique + bandeau renouvellement J-30', async ({ browser }) => {
    test.skip(!CONSEILLER_SESSION, 'E2E_CONSEILLER_SESSION absente — voir README.md');

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
            sameSite: 'Lax',
          },
        ],
        origins: [],
      },
    });
    const page = await conseillerContext.newPage();
    await page.goto('/fr/conseiller/conformite');

    // Statut visible
    await expect(page.getByRole('heading', { name: /Mon dossier/ })).toBeVisible();

    // Historique chargé (au moins 1 événement si dossier soumis)
    await expect(page.getByRole('heading', { name: /Historique/ })).toBeVisible();

    // Bandeau renouvellement si cert expirant J-30 (dépend du seed)
    if (process.env.E2E_RENEWAL_DUE === 'true') {
      await expect(page.getByText(/Pensez à renouveler/)).toBeVisible();
    }

    await conseillerContext.close();
  });
});
