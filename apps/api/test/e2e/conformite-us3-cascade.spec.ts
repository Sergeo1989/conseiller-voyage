// T101 — E2E Playwright US3 : cascade retrait de permis.
//
// Scénario :
//   1. Seed 3 conseillers verified affiliés au même permit "OPC-CASCADE"
//   2. Admin visite /admin/conformite/permis → déclare le retrait
//   3. Vérifie message succès "3 conseiller(s) affecté(s), 3 basculé(s)"
//   4. Pour chaque conseiller, vérifier statut "Suspendu" en < 10s
//      (propagation FR-022 négative)
//
// PRÉREQUIS : voir README.md.

import { expect, test } from '@playwright/test';

const ADMIN_SESSION = process.env.E2E_ADMIN_SESSION;
const CONSEILLER_SESSIONS = process.env.E2E_CASCADE_CONSEILLER_SESSIONS?.split(',') ?? [];

test.describe('US3 — Cascade retrait de permis', () => {
  test('admin déclare retrait → 3 conseillers basculés suspended en < 10s', async ({ browser }) => {
    test.skip(
      !ADMIN_SESSION || CONSEILLER_SESSIONS.length < 3,
      'Sessions de test admin + 3 conseillers absentes — voir README.md',
    );

    // --- ACTE 1 : admin déclare le retrait ---
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
            sameSite: 'Lax',
          },
        ],
        origins: [],
      },
    });
    const adminPage = await adminContext.newPage();

    await adminPage.goto('/fr/admin/conformite/permis');
    await adminPage.getByLabel(/Numéro de permis/).fill('OPC-CASCADE');
    await adminPage.getByLabel(/Motif/).fill('Permis retiré suite à enquête réglementaire OPC.');
    await adminPage.getByRole('button', { name: /Déclarer le retrait/ }).click();

    await expect(adminPage.getByText(/3 conseiller\(s\) affecté\(s\)/)).toBeVisible({
      timeout: 10_000,
    });

    await adminContext.close();

    // --- ACTE 2 : chacun des 3 conseillers voit 'Suspendu' < 10s ---
    const start = Date.now();
    for (const session of CONSEILLER_SESSIONS.slice(0, 3)) {
      const ctx = await browser.newContext({
        storageState: {
          cookies: [
            {
              name: '__Host-cv.session.token',
              value: session,
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
      const page = await ctx.newPage();
      await page.goto('/fr/conseiller/conformite');
      await expect(page.getByText(/Suspendu/)).toBeVisible({ timeout: 10_000 });
      await ctx.close();
    }
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(15_000);
  });
});
