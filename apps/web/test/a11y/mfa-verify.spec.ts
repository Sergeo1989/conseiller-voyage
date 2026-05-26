// T096 — Tests a11y axe-core sur /mfa/verify + /mfa/recovery (US3).
// Tag @a11y → filtré par `pnpm test:a11y`. Principe XI bloquant CI.

import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test.describe('@a11y MFA Verify pages', () => {
  test('/fr/mfa/verify → no axe-core violations (sérieuses/critiques)', async ({ page }) => {
    await page.goto('/fr/mfa/verify');
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

  test('/fr/mfa/recovery → no axe-core violations (sérieuses/critiques)', async ({ page }) => {
    await page.goto('/fr/mfa/recovery');
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
