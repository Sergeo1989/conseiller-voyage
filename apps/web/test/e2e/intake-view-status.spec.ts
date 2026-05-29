// T092 — Tests e2e Playwright de la page récap US2.
//
// Sans cookie session voyageur : la page redirige vers /voyage/lien-expire.
// Le test complet (avec submit + verify + cookie set) nécessite le seed
// LocalStack SES + lookup mailbox — différé en attendant l'helper de seed.

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

test.describe('e2e — Page récap voyageur sans session (US2)', () => {
  test('GET /voyage/[token] sans cookie → redirect vers /voyage/lien-expire', async ({ page }) => {
    test.skip(skipAll, 'dev server not running');
    // briefId hexadécimal mais pas un token (32 chars). Devrait être
    // traité comme briefId direct → fetch sans cookie → 401 → redirect.
    await page.goto(`${BASE_URL}/fr/voyage/11111111-1111-4111-8111-111111111111`);
    await page.waitForURL(/\/voyage\/lien-expire/i, { timeout: 5_000 });
    await expect(page.locator('h1')).toContainText(/expiré|already been used/i);
  });

  test('GET /voyage/mes-briefs sans cookie → redirect lien-expire', async ({ page }) => {
    test.skip(skipAll, 'dev server not running');
    await page.goto(`${BASE_URL}/fr/voyage/mes-briefs`);
    await page.waitForURL(/\/voyage\/lien-expire/i, { timeout: 5_000 });
  });
});
