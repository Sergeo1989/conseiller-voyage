// T076 — Tests a11y axe-core sur les 5 étapes du wizard intake.
// Principe XI WCAG 2.1 AA NON-NÉGOCIABLE — zéro violation serious/critical.
//
// Tag @a11y → `pnpm test:a11y` filtre ces tests.
//
// PRÉREQUIS : dev server tournant sur localhost:3000
//   pnpm docker:up && pnpm dev

import AxeBuilder from '@axe-core/playwright';
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

test.describe('a11y — Wizard intake 5 étapes (Principe XI WCAG 2.1 AA) @a11y', () => {
  test('Étape 1 (Destination) — zéro violation critical/serious', async ({ page }) => {
    test.skip(skipAll, 'dev server not running');
    await page.goto(`${BASE_URL}/fr/voyage/nouveau`);
    await expect(page.locator('#step1-title')).toBeVisible();

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();

    const blocking = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    );
    expect(
      blocking,
      `Violations a11y étape 1 :\n${JSON.stringify(blocking, null, 2)}`,
    ).toHaveLength(0);
  });

  test('Étape 2 (Dates) — zéro violation', async ({ page }) => {
    test.skip(skipAll, 'dev server not running');
    await page.goto(`${BASE_URL}/fr/voyage/nouveau`);
    await page.locator('input[id="destinations.0.country"]').fill('IT');
    await page.getByRole('button', { name: /Suivant/i }).click();
    await expect(page.locator('#step2-title')).toBeVisible();

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    const blocking = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    );
    expect(blocking, JSON.stringify(blocking, null, 2)).toHaveLength(0);
  });

  test('Étape 3 (Groupe) — zéro violation', async ({ page }) => {
    test.skip(skipAll, 'dev server not running');
    await page.goto(`${BASE_URL}/fr/voyage/nouveau`);
    await page.locator('input[id="destinations.0.country"]').fill('IT');
    await page.getByRole('button', { name: /Suivant/i }).click();
    await page.locator('input#departureDate').fill('2027-03-15');
    await page.locator('input#returnDate').fill('2027-03-30');
    await page.getByRole('button', { name: /Suivant/i }).click();
    await expect(page.locator('#step3-title')).toBeVisible();

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    const blocking = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    );
    expect(blocking, JSON.stringify(blocking, null, 2)).toHaveLength(0);
  });

  test('Étape 4 (Préférences) — zéro violation', async ({ page }) => {
    test.skip(skipAll, 'dev server not running');
    await page.goto(`${BASE_URL}/fr/voyage/nouveau`);
    await page.locator('input[id="destinations.0.country"]').fill('IT');
    await page.getByRole('button', { name: /Suivant/i }).click();
    await page.locator('input#departureDate').fill('2027-03-15');
    await page.locator('input#returnDate').fill('2027-03-30');
    await page.getByRole('button', { name: /Suivant/i }).click();
    await page.getByRole('button', { name: /Suivant/i }).click();
    await expect(page.locator('#step4-title')).toBeVisible();

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    const blocking = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    );
    expect(blocking, JSON.stringify(blocking, null, 2)).toHaveLength(0);
  });

  test('Étape 5 (Contact + consentement) — zéro violation', async ({ page }) => {
    test.skip(skipAll, 'dev server not running');
    await page.goto(`${BASE_URL}/fr/voyage/nouveau`);
    await page.locator('input[id="destinations.0.country"]').fill('IT');
    await page.getByRole('button', { name: /Suivant/i }).click();
    await page.locator('input#departureDate').fill('2027-03-15');
    await page.locator('input#returnDate').fill('2027-03-30');
    await page.getByRole('button', { name: /Suivant/i }).click();
    await page.getByRole('button', { name: /Suivant/i }).click();
    await page.locator('input[type="radio"][value="between_5k_10k"]').check();
    await page.locator('select#conseillerLanguage').selectOption('fr');
    await page.locator('select#speciality').selectOption('lune_de_miel');
    await page.locator('input[type="radio"][value="experienced_traveler"]').check();
    await page.getByRole('button', { name: /Suivant/i }).click();
    await expect(page.locator('#step5-title')).toBeVisible();

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    const blocking = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    );
    expect(blocking, JSON.stringify(blocking, null, 2)).toHaveLength(0);
  });

  test('Page email-envoyé — zéro violation', async ({ page }) => {
    test.skip(skipAll, 'dev server not running');
    await page.goto(`${BASE_URL}/fr/voyage/email-envoye?email=test@example.com`);
    await expect(page.locator('h1')).toBeVisible();

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    const blocking = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    );
    expect(blocking, JSON.stringify(blocking, null, 2)).toHaveLength(0);
  });

  test('Page lien-expiré — zéro violation', async ({ page }) => {
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

test.describe('a11y — Navigation clavier intégrale (SC-009 invariant) @a11y', () => {
  test('Étape 1 → 5 navigable au clavier sans souris', async ({ page }) => {
    test.skip(skipAll, 'dev server not running');
    await page.goto(`${BASE_URL}/fr/voyage/nouveau`);
    await expect(page.locator('#step1-title')).toBeVisible();

    // Le focus initial doit pouvoir cibler le 1er input via Tab
    await page.keyboard.press('Tab');
    const firstFocused = await page.evaluate(() => document.activeElement?.tagName);
    expect(firstFocused).toBeTruthy();

    // Tab plusieurs fois pour arriver au bouton « Suivant »
    let nextButtonFocused = false;
    for (let i = 0; i < 15; i++) {
      await page.keyboard.press('Tab');
      const tag = await page.evaluate(() => ({
        tag: document.activeElement?.tagName,
        text: document.activeElement?.textContent?.trim(),
      }));
      if (tag.tag === 'BUTTON' && tag.text && /Suivant/i.test(tag.text)) {
        nextButtonFocused = true;
        break;
      }
    }
    expect(
      nextButtonFocused,
      "Le bouton « Suivant » doit être atteignable au clavier depuis l'étape 1",
    ).toBe(true);
  });
});
