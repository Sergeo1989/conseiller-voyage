// T113 + T115j — Tests e2e Playwright erasure US4.
//
// Sans cookie session voyageur : les pages d'erasure redirigent ou
// affichent le bouton désactivé tant que la phrase ne match pas.

import { expect, test } from '@playwright/test';

const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';

async function isDevServerUp(): Promise<boolean> {
  try {
    const response = await fetch(`${BASE_URL}/fr/voyage/nouveau`, {
      signal: AbortSignal.timeout(2000),
    });
    return response.status < 500;
  } catch {
    return false;
  }
}

let skipAll = false;

test.beforeAll(async () => {
  skipAll = !(await isDevServerUp());
});

test.describe('e2e — ErasureForm (FR-022)', () => {
  test('bouton désactivé si phrase ≠ exacte', async ({ page }) => {
    test.skip(skipAll, 'dev server not running');
    await page.goto(`${BASE_URL}/fr/voyage/11111111-1111-4111-8111-111111111111/effacement`);
    const submit = page.getByRole('button', { name: /Supprimer définitivement/i });
    await expect(submit).toBeDisabled();

    // Tape phrase incorrecte
    await page.locator('input[type="text"]').fill('JE_CONFIRME_LA_SUPPRESSION');
    await expect(submit).toBeDisabled();

    // Tape phrase exacte
    await page.locator('input[type="text"]').fill('JE_CONFIRME_LA_SUPPRESSION_IRREVERSIBLE');
    // Sans cookie, l'action va échouer mais le bouton DOIT être enabled
    await expect(submit).toBeEnabled();
  });
});

test.describe('e2e — EraseAllDataForm (FR-022a)', () => {
  test('page /mes-donnees/effacer-tout sans cookie → redirect lien-expire', async ({ page }) => {
    test.skip(skipAll, 'dev server not running');
    await page.goto(`${BASE_URL}/fr/voyage/mes-donnees/effacer-tout`);
    await page.waitForURL(/\/voyage\/lien-expire/i, { timeout: 5_000 });
  });

  test('GET /voyage/supprime affiche page neutre sans PII', async ({ page }) => {
    test.skip(skipAll, 'dev server not running');
    await page.goto(`${BASE_URL}/fr/voyage/supprime`);
    await expect(page.locator('h1')).toBeVisible();
    // Aucune PII (email, nom) ne devrait être affichée
    const body = await page.locator('body').textContent();
    expect(body).not.toMatch(/@/); // pas d'email
  });

  test('GET /voyage/mes-donnees/effacee affiche confirmation neutre', async ({ page }) => {
    test.skip(skipAll, 'dev server not running');
    await page.goto(`${BASE_URL}/fr/voyage/mes-donnees/effacee`);
    await expect(page.locator('h1')).toBeVisible();
  });
});
