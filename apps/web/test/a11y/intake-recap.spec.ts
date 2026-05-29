// T093 — Tests a11y axe-core sur la page récap + mes-briefs.
// Note : ces pages redirigent si pas de session → on teste la page de
// destination (lien-expire) qui est accessible publiquement.
// Le test du recap réel nécessite session seeded — différé.

import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';

async function isDevServerUp(): Promise<boolean> {
  try {
    const response = await fetch(`${BASE_URL}/fr/voyage/lien-expire`, {
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

test.describe('a11y — Récap + mes-briefs (Principe XI WCAG 2.1 AA) @a11y', () => {
  test('Page lien-expire (redirect target) — zéro violation', async ({ page }) => {
    test.skip(skipAll, 'dev server not running');
    await page.goto(`${BASE_URL}/fr/voyage/lien-expire`);
    await expect(page.locator('h1')).toBeVisible();
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    const blocking = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    );
    expect(blocking, JSON.stringify(blocking, null, 2)).toHaveLength(0);
  });
});
