// T094 — Tests a11y axe-core sur la page publique conseiller (feature 007 US2).
// Principe XI WCAG 2.1 AA NON-NÉGOCIABLE (constitution v2.2.0).
//
// Tag @a11y → `pnpm test:a11y` filtre ces tests.
//
// PRÉREQUIS : dev server tournant sur localhost:3000
//   pnpm docker:up && pnpm dev
//
// Scope sans seed DB : 404 unifié sur les slugs inexistants. La page
// nominale (verified + pret + champs complets) nécessite un endpoint
// dev de seeding — squelette .skip (pattern hérité de mfa-recovery).

import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3000';

test.describe('a11y — page publique conseiller (T094, WCAG 2.1 AA) @a11y', () => {
  test('404 unifié /fr/conseiller/<inexistant> — zéro violation critical/serious', async ({
    page,
  }) => {
    await page.goto(`${BASE}/fr/conseiller/inconnu-a11y-test`);
    await expect(page.locator('h1')).toBeVisible();

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();

    const blocking = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    );
    expect(
      blocking,
      `Violations a11y critical/serious sur /conseiller/<inexistant>:\n${JSON.stringify(blocking, null, 2)}`,
    ).toHaveLength(0);
  });

  test('404 conseiller — page focusable au clavier (lien retour accueil)', async ({ page }) => {
    await page.goto(`${BASE}/fr/conseiller/inconnu-a11y-test`);
    // Le lien "Retour à l'accueil" doit être focusable et activable au clavier
    const link = page.getByRole('link', { name: /accueil/i });
    await expect(link).toBeVisible();
    await link.focus();
    await expect(link).toBeFocused();
  });

  test('404 conseiller — h1 unique et significatif', async ({ page }) => {
    await page.goto(`${BASE}/fr/conseiller/inconnu-a11y-test`);
    const h1s = page.locator('h1');
    await expect(h1s).toHaveCount(1);
    await expect(h1s.first()).toContainText(/Page introuvable/i);
  });

  test.skip('a11y page nominale — profil pret verified, zéro violation @a11y', async () => {
    // Future : seed profil pret + verified + champs complets, GET
    // /fr/conseiller/<slug> → analyze axe-core, vérifier :
    //   - Hiérarchie h1 → h2 cohérente
    //   - Badge vérifié associé à une étiquette (aria-label OK)
    //   - CTA /intake focusable + contraste ≥ 4.5:1
    //   - Image profil avec alt non-redondant
    //   - SectionPourquoiPasContact accessible
  });
});
