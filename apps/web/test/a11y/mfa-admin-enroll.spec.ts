// T109 (a11y) — axe-core sur /admin/mfa/enroll (US5).

import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test.describe('@a11y Admin MFA enrollment page', () => {
  test('/fr/admin/mfa/enroll → no axe-core violations (sérieuses/critiques)', async ({ page }) => {
    await page.goto('/fr/admin/mfa/enroll');
    // Next.js 15 stream le <title> APRÈS l'HTML initial (redirect chain) — attendre injection.
    await page.waitForFunction(() => document.title.length > 0);
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
