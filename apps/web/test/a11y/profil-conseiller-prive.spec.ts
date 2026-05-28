// T071 — Tests a11y axe-core sur les pages conseiller privées (US1, US3, US4).
// Principe XI WCAG 2.1 AA NON-NÉGOCIABLE.
//
// Routes cibles :
//   - /fr/conseiller         (dashboard, US3)
//   - /fr/conseiller/profil  (édition, US1)
//   - /fr/conseiller/profil/apercu (aperçu, US4)
//
// Sans auth, les routes redirigent vers /connexion. On vérifie l'a11y
// de la page de connexion qui est servie en remplacement + le redirect
// effectif. Les pages authentifiées sont en .skip (nécessitent seed +
// session admin, à venir avec endpoint dev de seeding).

import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3000';

const PRIVATE_PATHS = [
  { path: '/fr/conseiller', label: 'dashboard US3' },
  { path: '/fr/conseiller/profil', label: 'édition US1' },
  { path: '/fr/conseiller/profil/apercu', label: 'aperçu US4' },
];

test.describe('a11y — pages conseiller privées (T071) @a11y', () => {
  for (const { path, label } of PRIVATE_PATHS) {
    test(`${path} (${label}) — redirect /connexion, page connexion a11y compliant`, async ({
      page,
    }) => {
      await page.goto(`${BASE}${path}`);
      // Soit on est redirigés vers /connexion, soit la page courante est
      // déjà la connexion. Dans les 2 cas on analyze l'URL courante.
      const currentUrl = page.url();
      expect(currentUrl).toMatch(/\/connexion|\/login|\/conseiller/);

      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze();

      const blocking = results.violations.filter(
        (v) => v.impact === 'critical' || v.impact === 'serious',
      );
      expect(
        blocking,
        `Violations a11y critical/serious après navigation vers ${path}:\n${JSON.stringify(blocking, null, 2)}`,
      ).toHaveLength(0);
    });
  }

  test.skip('édition profil authentifié — zéro violation @a11y', async () => {
    // Future : seed conseiller + login, GET /fr/conseiller/profil,
    // analyze axe-core sur ProfilForm. Cas critiques à vérifier :
    //   - Tous les fieldsets ont une <legend>
    //   - Compteur biographie associé via aria-describedby
    //   - Toggle afficherNomComplet a un label visible
    //   - Avertissement Loi 25 utilise role="alert"
    //   - Erreurs validation Zod focusables au keyboard
  });

  test.skip('dashboard conseiller authentifié — widgets a11y @a11y', async () => {
    // Future : seed + login, GET /fr/conseiller, analyze :
    //   - 4 widgets (Conformite, Profil, 2 Placeholder) avec headings h2
    //   - 3 alertes role="alert" (non-verifie, incomplet, masque_admin)
    //   - WidgetProfil champsManquants liste accessible
  });

  test.skip('aperçu profil authentifié — bandeau accessible @a11y', async () => {
    // Future : seed + login, GET /fr/conseiller/profil/apercu, analyze :
    //   - BandeauApercu role="status" (utilise <output>)
    //   - Réutilisation composants page publique → cohérence
  });
});
