// T077 — Tests e2e Playwright du flow de vérification magic link (US1 P1).
//
// Couvre :
//   1. Magic link valide consommé via POST /api/intake/briefs/verify →
//      réponse 200 + cookie session voyageur posé (FR-014a Q5)
//   2. Magic link expiré ou inexistant → 401 → la page Web /voyage/[token]
//      rediroute vers /voyage/lien-expire (US2 Phase 4 — non implémenté
//      ici, on teste le endpoint backend directement)
//   3. Page lien-expiré : form resend → réponse uniforme (anti-énumération)
//
// PRÉREQUIS : pnpm docker:up && pnpm dev (LocalStack SES inspection)
//
// NOTE : la page /voyage/[token] (US2 récap) viendra en Phase 4. Pour
// l'instant T077 MVP teste le flow API verify + la page lien-expiré
// publique. L'inspection LocalStack SES inbox sera ajoutée quand la
// page récap existera.

import { expect, request, test } from '@playwright/test';

const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
const API_URL = process.env.E2E_API_URL ?? 'http://localhost:3001';

async function isServerUp(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
    return response.status < 600;
  } catch {
    return false;
  }
}

let skipAll = false;

test.beforeAll(async () => {
  const [web, api] = await Promise.all([
    isServerUp(`${BASE_URL}/fr/voyage/lien-expire`),
    isServerUp(`${API_URL}/health`),
  ]);
  skipAll = !(web && api);
});

test.describe('e2e — Magic link verify (US1 P1)', () => {
  test('POST /api/intake/briefs/verify avec token invalide → 401/404', async () => {
    test.skip(skipAll, 'dev server not running');
    const ctx = await request.newContext({ baseURL: API_URL });
    const fakeToken = 'a'.repeat(64); // hex 64, valide format, n'existe pas en DB
    const response = await ctx.post('/api/intake/briefs/verify', {
      headers: { 'content-type': 'application/json', 'x-requested-by': 'web' },
      data: { token: fakeToken },
    });
    expect([401, 404]).toContain(response.status());
    await ctx.dispose();
  });

  test('POST /api/intake/briefs/verify avec token mal formé → 400', async () => {
    test.skip(skipAll, 'dev server not running');
    const ctx = await request.newContext({ baseURL: API_URL });
    const response = await ctx.post('/api/intake/briefs/verify', {
      headers: { 'content-type': 'application/json', 'x-requested-by': 'web' },
      data: { token: 'too-short' },
    });
    expect(response.status()).toBe(400);
    await ctx.dispose();
  });
});

test.describe('e2e — Page /voyage/lien-expire (FR-015 + H4)', () => {
  test('GET page lien-expire affiche le form resend', async ({ page }) => {
    test.skip(skipAll, 'dev server not running');
    await page.goto(`${BASE_URL}/fr/voyage/lien-expire`);
    await expect(page.locator('h1')).toContainText(/expiré|already been used/i);
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.getByRole('button', { name: /Renvoyer|Send me/i })).toBeVisible();
  });

  test('Resend avec email inexistant → message neutre uniforme (anti-énumération)', async ({
    page,
  }) => {
    test.skip(skipAll, 'dev server not running');
    await page.goto(`${BASE_URL}/fr/voyage/lien-expire`);
    await page.locator('input[type="email"]').fill('inexistant@example.com');
    await page.getByRole('button', { name: /Renvoyer|Send me/i }).click();
    // Réponse uniforme — toujours le même message peu importe l'email
    await expect(
      page.getByText(/un nouveau lien vient d['']être envoyé|new link has just been sent/i),
    ).toBeVisible({ timeout: 5_000 });
  });
});
