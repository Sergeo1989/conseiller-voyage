// T035 [Polish] — Test a11y axe-core du fil de conversation (WCAG 2.1 AA, Principe XI).
//
// Le slice `features/conversation` (ConversationThread + MessageList +
// MessageComposer + AntiTransactionNotice + AttachmentLink) est conçu accessible :
// sémantique de liste (`<ol>`/`<li>`), `<time dateTime>`, label associé au
// textarea, erreurs en `role="alert"` + `aria-live`, mention permanente en
// `role="note"`, lien de téléchargement avec libellé lecteur d'écran.
//
// Ce test s'active dès que 014 (dashboard conseiller) / 015 (espace voyageur)
// MONTENT la route qui rend `ConversationThread`. Tant que la route n'existe pas,
// il est `skip` (même convention que les tests d'intégration différés au staging).
// PRÉREQUIS quand actif : dev server + E2E_CONSEILLER_SESSION (voir e2e/README.md).

import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const CONSEILLER_SESSION = process.env.E2E_CONSEILLER_SESSION;

// Route cible (montée par 014). Exemple : /fr-CA/conseiller/conversations/<id>.
const CONVERSATION_ROUTE = process.env.E2E_CONVERSATION_ROUTE;

test.describe('@a11y Conversation thread (WCAG 2.1 AA)', () => {
  test.skip(
    !CONSEILLER_SESSION || !CONVERSATION_ROUTE,
    'Route conversation montée par 014/015 — fournir E2E_CONVERSATION_ROUTE + session pour activer.',
  );

  test('aucune violation axe sur le fil conseiller', async ({ browser }) => {
    const context = await browser.newContext({
      storageState: {
        cookies: [
          {
            name: '__Host-cv.session.token',
            value: CONSEILLER_SESSION as string,
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
    const page = await context.newPage();
    await page.goto(CONVERSATION_ROUTE as string);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(results.violations).toEqual([]);
    await context.close();
  });
});
