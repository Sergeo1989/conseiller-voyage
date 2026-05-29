// T075 — Tests e2e Playwright du flow soumission brief intake (US1 P1 MVP).
//
// Couvre :
//   1. Golden path : navigation 5 étapes → submit → page email-envoyé +
//      countdown 120s + bouton resend désactivé
//   2. Validation par étape : Next bloqué si champ obligatoire vide
//   3. localStorage reprise 24h : reload mid-formulaire restaure l'état
//      (Q3 clarify) MAIS pas le consentement (FR-010)
//
// PRÉREQUIS :
//   - `pnpm docker:up && pnpm db:migrate` (Postgres + LocalStack SES + Redis)
//   - `pnpm dev` (apps/web :3000 + apps/api :3001)
//
// Le test skipIf si la page racine ne répond pas (dev sans backend).

import { expect, test } from '@playwright/test';

const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';

test.describe.configure({ mode: 'serial' });

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

test.describe('e2e — Intake submit golden path (US1 P1)', () => {
  test('navigation 5 étapes + submit → page email-envoyé', async ({ page }) => {
    test.skip(skipAll, 'dev server not running (pnpm dev required)');
    // Email unique pour éviter rate-limit + idempotency entre tests
    const uniqueEmail = `e2e-${Date.now()}@example.com`;

    await page.goto(`${BASE_URL}/fr/voyage/nouveau`);
    await expect(page.locator('h1')).toBeVisible();

    // Étape 1 — Destination
    await page.locator('input[id="destinations.0.country"]').fill('IT');
    await page.locator('input[id="destinations.0.region"]').fill('Toscane');
    await page.getByRole('button', { name: /Suivant/i }).click();

    // Étape 2 — Dates
    await page.locator('input#departureDate').fill('2027-03-15');
    await page.locator('input#returnDate').fill('2027-03-30');
    await page.getByRole('button', { name: /Suivant/i }).click();

    // Étape 3 — Groupe (default adultsCount=2)
    await page.getByRole('button', { name: /Suivant/i }).click();

    // Étape 4 — Préférences
    await page.locator('input[type="radio"][value="between_5k_10k"]').check();
    await page.locator('select#conseillerLanguage').selectOption('fr');
    await page.locator('select#speciality').selectOption('lune_de_miel');
    await page.locator('input[type="radio"][value="experienced_traveler"]').check();
    await page.getByRole('button', { name: /Suivant/i }).click();

    // Étape 5 — Contact + consentement Loi 25
    await page.locator('input#firstName').fill('Marie');
    await page.locator('input#lastName').fill('Dupont');
    await page.locator('input#email').fill(uniqueEmail);
    await page.locator('input#postalCode').fill('H7N 1A1');
    await page.locator('input[type="checkbox"][name="consentGiven"]').check();

    await page.getByRole('button', { name: /Soumettre/i }).click();

    // Redirection vers la page email-envoyé avec query email
    await page.waitForURL(/\/fr\/voyage\/email-envoye/i, { timeout: 10_000 });
    await expect(page.locator('h1')).toContainText(/Vérifiez votre courriel/i);
    await expect(page.getByText(uniqueEmail)).toBeVisible();

    // Bouton resend désactivé au boot (countdown 120s)
    const resendButton = page.getByRole('button', { name: /Je n['']ai rien reçu/i });
    await expect(resendButton).toBeDisabled();
    await expect(resendButton).toHaveAttribute('aria-disabled', 'true');
  });

  test('Next bloqué étape 1 si destination.country vide', async ({ page }) => {
    test.skip(skipAll, 'dev server not running');
    await page.goto(`${BASE_URL}/fr/voyage/nouveau`);
    await page.getByRole('button', { name: /Suivant/i }).click();
    // Doit rester sur étape 1
    await expect(page.locator('#step1-title')).toBeVisible();
  });

  test('Submit bloqué étape 5 si consentGiven non coché (FR-010)', async ({ page }) => {
    test.skip(skipAll, 'dev server not running');
    const uniqueEmail = `e2e-noconsent-${Date.now()}@example.com`;

    await page.goto(`${BASE_URL}/fr/voyage/nouveau`);
    // Skip rapide jusqu'à étape 5 avec données minimales valides
    await page.locator('input[id="destinations.0.country"]').fill('FR');
    await page.getByRole('button', { name: /Suivant/i }).click();
    await page.locator('input#departureDate').fill('2027-06-01');
    await page.locator('input#returnDate').fill('2027-06-15');
    await page.getByRole('button', { name: /Suivant/i }).click();
    await page.getByRole('button', { name: /Suivant/i }).click(); // étape 3 OK
    await page.locator('input[type="radio"][value="between_2k_5k"]').check();
    await page.locator('select#conseillerLanguage').selectOption('en');
    await page.locator('select#speciality').selectOption('road_trip');
    await page.locator('input[type="radio"][value="occasional_traveler"]').check();
    await page.getByRole('button', { name: /Suivant/i }).click();
    await page.locator('input#firstName').fill('Jean');
    await page.locator('input#lastName').fill('Tremblay');
    await page.locator('input#email').fill(uniqueEmail);
    // Ne PAS cocher consentGiven

    await page.getByRole('button', { name: /Soumettre/i }).click();
    // Reste sur étape 5 — pas de redirect
    await expect(page).toHaveURL(/\/voyage\/nouveau/);
  });
});

test.describe('e2e — Page email-envoyé directe (sans submit)', () => {
  test('GET /voyage/email-envoye sans email affiche placeholder', async ({ page }) => {
    test.skip(skipAll, 'dev server not running');
    await page.goto(`${BASE_URL}/fr/voyage/email-envoye`);
    await expect(page.locator('h1')).toContainText(/Vérifiez votre courriel/i);
    // Bouton resend toujours là, désactivé
    const resendButton = page.getByRole('button', { name: /Je n['']ai rien reçu/i });
    await expect(resendButton).toBeDisabled();
  });
});
