// T017 [Polish] — Tests a11y axe-core du tableau de bord conseiller (WCAG 2.1 AA,
// Principe XI). Pages privées (session conseiller requise).
//
// PRÉREQUIS : dev server + E2E_CONSEILLER_SESSION (voir e2e/README.md).
// Skip si la session n'est pas fournie (même convention que conformite.spec.ts).

import AxeBuilder from '@axe-core/playwright';
import { type Browser, expect, test } from '@playwright/test';

const CONSEILLER_SESSION = process.env.E2E_CONSEILLER_SESSION;

const PAGES = ['/fr-CA/conseiller/leads', '/fr-CA/conseiller/conversations'];

async function makeContext(browser: Browser, session: string) {
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

test.describe('@a11y Tableau de bord conseiller (WCAG 2.1 AA)', () => {
  test.skip(!CONSEILLER_SESSION, 'E2E_CONSEILLER_SESSION requis pour activer ces tests.');

  for (const path of PAGES) {
    test(`aucune violation axe sur ${path}`, async ({ browser }) => {
      const context = await makeContext(browser, CONSEILLER_SESSION as string);
      const page = await context.newPage();
      await page.goto(path);
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
      expect(results.violations).toEqual([]);
      await context.close();
    });
  }
});
