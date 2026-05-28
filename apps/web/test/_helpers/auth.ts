// Helper Playwright : injecter le cookie de session E2E dans le browser
// context. À utiliser dans les tests authentifiés une fois que
// globalSetup a peuplé `E2E_CONSEILLER_SESSION` / `E2E_ADMIN_SESSION`.
//
// Usage type :
//
//   import { setupSessionCookie } from '../_helpers/auth';
//
//   const CONSEILLER_SESSION = process.env.E2E_CONSEILLER_SESSION;
//
//   test.describe('parcours conseiller authentifié', () => {
//     test.skip(!CONSEILLER_SESSION, 'E2E_CONSEILLER_SESSION absente.');
//
//     test('dashboard a11y compliant', async ({ page, context }) => {
//       await setupSessionCookie(context, CONSEILLER_SESSION!);
//       await page.goto('/fr/conseiller');
//       // ... assertions
//     });
//   });

import type { BrowserContext } from '@playwright/test';

const COOKIE_NAME_DEV = 'authjs.session-token';

export async function setupSessionCookie(
  context: BrowserContext,
  sessionToken: string,
  options: { domain?: string; secure?: boolean } = {},
): Promise<void> {
  await context.addCookies([
    {
      name: COOKIE_NAME_DEV,
      value: sessionToken,
      domain: options.domain ?? 'localhost',
      path: '/',
      httpOnly: true,
      secure: options.secure ?? false,
      sameSite: 'Lax',
      // 30 jours, aligné sur SESSION_TTL_DAYS du seed endpoint
      expires: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
    },
  ]);
}
