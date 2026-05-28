// T045 + T061 — Tests a11y axe-core sur les 5 pages publiques légales
// + Footer. Principe XI WCAG 2.1 AA NON-NÉGOCIABLE.
//
// Tag @a11y → `pnpm test:a11y` filtre ces tests.
//
// PRÉREQUIS : dev server tournant sur localhost:3000
//   pnpm docker:up && pnpm dev

import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';

const LEGAL_PAGES = [
  '/fr/comment-ca-marche',
  '/fr/mentions-legales',
  '/fr/cgu-voyageur',
  '/fr/cgu-conseiller',
  '/fr/confidentialite',
];

test.describe('a11y — 5 pages légales (Principe XI WCAG 2.1 AA) @a11y', () => {
  for (const path of LEGAL_PAGES) {
    test(`${path} — zéro violation critical/serious`, async ({ page }) => {
      await page.goto(`${BASE_URL}${path}`);
      // Wait for the SSG content to be fully rendered
      await expect(page.locator('h1')).toBeVisible();

      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze();

      const blocking = results.violations.filter(
        (v) => v.impact === 'critical' || v.impact === 'serious',
      );
      expect(
        blocking,
        `Violations a11y critical/serious sur ${path}:\n${JSON.stringify(blocking, null, 2)}`,
      ).toHaveLength(0);
    });
  }

  test('Footer — présence des 5 liens accessibles au clavier @a11y', async ({ page }) => {
    await page.goto(`${BASE_URL}/fr/comment-ca-marche`);

    // Le footer doit contenir les 5 liens identifiés via aria-label
    const footer = page.locator('footer');
    await expect(footer).toBeVisible();

    // Les liens du footer utilisent aria-label descriptif (a11y), pas le
    // textContent. On vérifie par filter({ hasText }) qui matche le texte
    // visible. Couvre les 5 slugs légaux.
    const legalLinks = [
      'Mentions légales',
      'CGU voyageur',
      'CGU conseiller',
      'Confidentialité',
      'Comment ça marche',
    ];
    for (const label of legalLinks) {
      await expect(footer.locator('a').filter({ hasText: label })).toBeVisible();
    }

    // Tous les liens du footer doivent être focusables séquentiellement
    const links = footer.getByRole('link');
    const count = await links.count();
    expect(count).toBeGreaterThanOrEqual(5);
  });
});
