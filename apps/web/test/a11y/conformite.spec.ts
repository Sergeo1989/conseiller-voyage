// T120 — Tests a11y automatisés axe-core (WCAG 2.1 AA — Principe XI).
//
// Couvre toutes les pages publiques du module conformité.
// Tag @a11y → `pnpm test:a11y` filtre uniquement ces tests.
//
// PRÉREQUIS : voir apps/api/test/e2e/README.md.
//   + pnpm add -D @axe-core/playwright

import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const CONSEILLER_SESSION = process.env.E2E_CONSEILLER_SESSION;
const ADMIN_SESSION = process.env.E2E_ADMIN_SESSION;

const PAGES_CONSEILLER = [
  '/fr-CA/conseiller/conformite',
  '/fr-CA/conseiller/conformite/soumettre',
  '/fr-CA/conseiller/conformite/renouveler',
  '/fr-CA/conseiller/conformite/effacement',
];

const PAGES_ADMIN = ['/fr-CA/admin/conformite', '/fr-CA/admin/conformite/permis'];

async function makeContext(browser: import('@playwright/test').Browser, session: string) {
  return browser.newContext({
    storageState: {
      cookies: [
        {
          name: '__Host-cv.session.token',
          value: session,
          domain: 'localhost',
          path: '/',
          httpOnly: true,
          secure: false,
          sameSite: 'Lax',
        },
      ],
      origins: [],
    },
  });
}

test.describe('@a11y — Pages conseiller (WCAG 2.1 AA)', () => {
  for (const url of PAGES_CONSEILLER) {
    test(`@a11y ${url}`, async ({ browser }) => {
      test.skip(!CONSEILLER_SESSION, 'E2E_CONSEILLER_SESSION absente.');
      const ctx = await makeContext(browser, CONSEILLER_SESSION as string);
      const page = await ctx.newPage();
      await page.goto(url);
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
      expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
      await ctx.close();
    });
  }
});

test.describe('@a11y — Pages admin (WCAG 2.1 AA)', () => {
  for (const url of PAGES_ADMIN) {
    test(`@a11y ${url}`, async ({ browser }) => {
      test.skip(!ADMIN_SESSION, 'E2E_ADMIN_SESSION absente.');
      const ctx = await makeContext(browser, ADMIN_SESSION as string);
      const page = await ctx.newPage();
      await page.goto(url);
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
      expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
      await ctx.close();
    });
  }
});
