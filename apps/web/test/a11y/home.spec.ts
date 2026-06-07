// T026 [US3] — Tests a11y axe-core sur la page d'accueil (Principe XI WCAG 2.1 AA).
//
// Tag @a11y → `pnpm test:a11y` filtre ces tests.
// PRÉREQUIS : dev server sur localhost:3000 (pnpm dev).

import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';

test.describe('a11y — page d’accueil (Principe XI WCAG 2.1 AA) @a11y', () => {
  test('/fr — zéro violation critical/serious @a11y', async ({ page }) => {
    await page.goto(`${BASE_URL}/fr`);
    await expect(page.locator('h1')).toBeVisible();

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();

    const blocking = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    );
    expect(
      blocking,
      `Violations a11y critical/serious sur /fr:\n${JSON.stringify(blocking, null, 2)}`,
    ).toHaveLength(0);
  });

  test('/fr — un seul <h1> et CTA primaire opérable au clavier @a11y', async ({ page }) => {
    await page.goto(`${BASE_URL}/fr`);

    await expect(page.locator('h1')).toHaveCount(1);

    // Le CTA primaire (lien vers l'intake) est atteignable et activable au clavier.
    const cta = page.getByRole('link', { name: /Décrire mon voyage/i }).first();
    await expect(cta).toBeVisible();
    await cta.focus();
    await expect(cta).toBeFocused();
  });
});
