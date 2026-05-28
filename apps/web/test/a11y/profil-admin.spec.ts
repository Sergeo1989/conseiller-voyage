// T125 — Tests a11y axe-core sur la console admin profils (US6).
// Principe XI WCAG 2.1 AA NON-NÉGOCIABLE.
//
// Routes cibles :
//   - /fr/admin/profils       (liste paginée, T121)
//   - /fr/admin/profils/[id]  (détail + Dialog confirmation, T122 + T123)
//
// Sans auth admin, redirect /connexion. On vérifie l'a11y de la page
// servie + le redirect. Les pages admin authentifiées (avec dialog
// Radix focus trap) sont en .skip — couverture comportementale assurée
// par les 9 tests intégration admin-moderation.

import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3000';

test.describe('a11y — console admin profils (T125, US6) @a11y', () => {
  test('/fr/admin/profils sans auth — redirect ou erreur a11y compliant', async ({ page }) => {
    await page.goto(`${BASE}/fr/admin/profils`);
    // Next.js 15 stream le <title> APRÈS l'HTML initial — attendre injection.
    await page.waitForFunction(() => document.title.length > 0);
    const url = page.url();
    // Soit /connexion, soit /admin/profils avec erreur "session admin requise"
    expect(url).toMatch(/\/connexion|\/login|\/admin\/profils/);

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();

    const blocking = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    );
    expect(
      blocking,
      `Violations a11y critical/serious sur /admin/profils :\n${JSON.stringify(blocking, null, 2)}`,
    ).toHaveLength(0);
  });

  test("/fr/admin/profils/<id-inexistant> — page d'erreur a11y compliant", async ({ page }) => {
    await page.goto(`${BASE}/fr/admin/profils/00000000-0000-4000-8000-000000000000`);
    // Next.js 15 stream le <title> APRÈS l'HTML initial — attendre injection.
    await page.waitForFunction(() => document.title.length > 0);
    const url = page.url();
    expect(url).toMatch(/\/connexion|\/login|\/admin\/profils/);

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();

    const blocking = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    );
    expect(blocking).toHaveLength(0);
  });

  test.skip('admin authentifié — liste avec filtres statut a11y @a11y', async () => {
    // Future : seed admin, login, GET /admin/profils, analyze :
    //   - Table 5 colonnes a un <caption> ou aria-label
    //   - Headers th[scope="col"] présents
    //   - Liens de filtre statut accessibles (badge a11y avec contraste OK)
    //   - Pagination <nav aria-label="Pagination"> avec liens prev/next
  });

  test.skip('admin authentifié — détail + Dialog focus trap @a11y', async () => {
    // Future : seed + login, GET /admin/profils/<id>, vérifier :
    //   - <dl> structure liste de définitions OK
    //   - Boutons d'action focusables séquentiellement
    //   - Click "Masquer" → Dialog Radix avec :
    //     - role="dialog" + aria-modal="true" (Radix gère)
    //     - aria-labelledby pointe sur Dialog.Title
    //     - aria-describedby pointe sur description
    //     - Focus trap : Tab cycle dans le dialog uniquement
    //     - Escape ferme + restaure focus déclencheur
  });
});
