// T121 — Tests a11y axe-core sur /parametres/mfa/* (US6).

import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const ROUTES = [
  '/fr/parametres/mfa',
  '/fr/parametres/mfa/change-device',
  '/fr/parametres/mfa/regenerate-codes',
];

test.describe('@a11y Paramètres MFA pages', () => {
  for (const route of ROUTES) {
    test(`${route} → no axe-core violations (sérieuses/critiques)`, async ({ page }) => {
      await page.goto(route);
      // Next.js 15 stream le <title> APRÈS l'HTML initial (redirect chain) — attendre injection.
      await page.waitForFunction(() => document.title.length > 0);
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
      const seriousOrCritical = results.violations.filter(
        (v) => v.impact === 'serious' || v.impact === 'critical',
      );
      if (seriousOrCritical.length > 0) {
        console.error(`Violations sur ${route} :`, JSON.stringify(seriousOrCritical, null, 2));
      }
      expect(seriousOrCritical).toEqual([]);
    });
  }
});
