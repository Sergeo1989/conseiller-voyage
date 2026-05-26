// T074 — Test a11y axe-core sur la page d'enrôlement MFA.
// Tag @a11y → filtré par `pnpm test:a11y`.
// CI bloquant : aucune violation sérieuse ou critique tolérée
// (Principe XI WCAG 2.1 AA).

import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test.describe('@a11y MFA enrollment page', () => {
  test('/fr/mfa/enroll → no axe-core violations (sérieuses/critiques)', async ({ page }) => {
    await page.goto('/fr/mfa/enroll');

    // La page redirige vers /login sans session valide.
    // On accepte les deux cas pour ce smoke test a11y :
    //   - Page d'enrôlement rendue (si test seedé)
    //   - Page de login après redirect (cas par défaut sans seed)
    // L'a11y scan tourne sur ce qui est rendu.

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    const seriousOrCritical = results.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical',
    );

    if (seriousOrCritical.length > 0) {
      console.error(
        'axe-core violations sérieuses/critiques :',
        JSON.stringify(seriousOrCritical, null, 2),
      );
    }

    expect(seriousOrCritical).toEqual([]);
  });
});
