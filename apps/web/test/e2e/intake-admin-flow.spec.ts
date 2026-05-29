// T130 — Tests e2e Playwright admin flow US5.
// Sans session admin : redirect /login.

import { test } from '@playwright/test';

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

test.describe('e2e — Admin intake flow (US5)', () => {
  test('/admin/intake/non-matche sans session admin → redirect /login', async ({ page }) => {
    test.skip(skipAll, 'dev server not running');
    await page.goto(`${BASE_URL}/fr/admin/intake/non-matche`);
    await page.waitForURL(/\/login/i, { timeout: 5_000 });
  });

  test('/admin/intake/[briefId] sans session admin → redirect /login', async ({ page }) => {
    test.skip(skipAll, 'dev server not running');
    await page.goto(`${BASE_URL}/fr/admin/intake/11111111-1111-4111-8111-111111111111`);
    await page.waitForURL(/\/login/i, { timeout: 5_000 });
  });
});
