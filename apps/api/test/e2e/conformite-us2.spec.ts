// T090 — E2E Playwright US2 : bascule auto suspended à l'expiration.
//
// Scénario :
//   1. Seed un conseiller verified avec cert qui expire dans 1 jour
//   2. Avance l'horloge (via API admin de test ou injection clock)
//   3. Trigger ExpirationSweepJob.sweep() via endpoint interne
//   4. Vérifier que le statut est passé à 'suspended'
//
// PRÉREQUIS : voir README.md du même répertoire.
//
// TODO : endpoint interne /api/conformite/_system/expiration-sweep
// + endpoint /api/conformite/_system/clock pour le seed dynamique
// (les deux protégés par X-Internal-Token).

import { expect, test } from '@playwright/test';

const ADMIN_SESSION = process.env.E2E_ADMIN_SESSION;
const CONSEILLER_SESSION = process.env.E2E_CONSEILLER_SESSION;
const INTERNAL_TOKEN = process.env.E2E_INTERNAL_TOKEN;

test.describe('US2 — Expiration automatique', () => {
  test('cert expirant J-1 → sweep → statut suspended', async ({ request, browser }) => {
    test.skip(
      !ADMIN_SESSION || !CONSEILLER_SESSION || !INTERNAL_TOKEN,
      'Sessions de test ou INTERNAL_TOKEN absents — voir README.md',
    );

    // Trigger le sweep (l'infra de seed est responsable d'avoir
    // pré-positionné un cert expirant J-1 avant ce test).
    const sweepResponse = await request.post('/api/conformite/_system/expiration-sweep', {
      headers: {
        'X-Internal-Token': INTERNAL_TOKEN as string,
        'X-Requested-By': 'system',
      },
    });
    expect(sweepResponse.ok()).toBe(true);

    // Vérifier que le conseiller voit son statut suspended
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
    const conseillerPage = await conseillerContext.newPage();
    await conseillerPage.goto('/fr/conseiller/conformite');
    await expect(conseillerPage.getByText(/Suspendu/)).toBeVisible();

    await conseillerContext.close();
  });
});
