// T129 — Tests a11y axe-core admin pages.
// Sans session admin les pages redirigent → on teste la page /login cible.

import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';

async function isDevServerUp(): Promise<boolean> {
  try {
    const response = await fetch(`${BASE_URL}/fr/login`, {
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

test.describe('a11y — Pages admin intake (Principe XI) @a11y', () => {
  test('/admin/intake/non-matche (sans session → login) — zéro violation', async ({ page }) => {
    test.skip(skipAll, 'dev server not running');
    await page.goto(`${BASE_URL}/fr/admin/intake/non-matche`);
    // Attendre le redirect
    await page.waitForURL(/\/login/i, { timeout: 5_000 });
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    const blocking = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    );
    expect(blocking, JSON.stringify(blocking, null, 2)).toHaveLength(0);
  });
});
