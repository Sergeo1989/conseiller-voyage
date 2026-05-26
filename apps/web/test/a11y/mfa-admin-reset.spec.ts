// T105 — Tests a11y axe-core sur la page admin reset MFA (US4).
// Tag @a11y → filtré par `pnpm test:a11y`. Principe XI bloquant CI.

import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test.describe('@a11y Admin Reset MFA page', () => {
  test('/fr/admin/users/<id>/reset-mfa → no axe-core violations (sérieuses/critiques)', async ({
    page,
  }) => {
    await page.goto('/fr/admin/users/00000000-0000-4000-8000-aaaa00000001/reset-mfa');
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    const seriousOrCritical = results.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical',
    );
    if (seriousOrCritical.length > 0) {
      console.error('Violations sérieuses/critiques :', JSON.stringify(seriousOrCritical, null, 2));
    }
    expect(seriousOrCritical).toEqual([]);
  });
});
