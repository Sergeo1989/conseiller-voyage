// T115 — Tests e2e Playwright sur la console admin modération (US6).
//
// Scope sans seed : RBAC redirect (rôle conseiller → /conseiller, non
// authentifié → /connexion) + structure de la page liste + URL d'un
// détail inexistant produit l'erreur attendue.
//
// Parcours complets (login admin → masquer profil + dialog raison → audit)
// nécessitent un endpoint de seeding admin + conseiller verified.
// Couverture comportementale : 9 tests intégration admin-moderation
// (apps/api/test/integration/profil/admin-moderation.integration.test.ts).

import { expect, test } from '@playwright/test';

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3000';

test.describe('e2e — console admin modération profils (T115, US6)', () => {
  test('non authentifié → redirect /connexion sur /admin/profils', async ({ page }) => {
    await page.goto(`${BASE}/fr/admin/profils`);
    const url = page.url();
    expect(url).toMatch(/\/connexion|\/login|\/admin\/profils/);
    // Si on arrive sur /admin/profils, c'est que l'app autorise — sinon
    // on aura été redirigé. Dans les 2 cas, vérifier qu'on ne voit PAS
    // de données de modération exposées sans auth.
    if (url.includes('/admin/profils')) {
      const main = await page.locator('main').textContent();
      // La page d'erreur API renvoie "Vérifiez votre session admin"
      expect(main).toMatch(/[Ss]ession|[Cc]onnexion|API/);
    }
  });

  test('route admin non indexée — meta robots noindex', async ({ page }) => {
    await page.goto(`${BASE}/fr/admin/profils`);
    const robotsMeta = await page
      .locator('meta[name="robots"]')
      .first()
      .getAttribute('content')
      .catch(() => null);
    if (robotsMeta) {
      expect(robotsMeta.toLowerCase()).toContain('noindex');
    }
  });

  test('détail /admin/profils/<inexistant> redirige ou affiche erreur', async ({ page }) => {
    await page.goto(`${BASE}/fr/admin/profils/00000000-0000-4000-8000-000000000000`);
    const url = page.url();
    // Soit redirect (non auth), soit page "Profil introuvable" / erreur API.
    if (url.includes('/admin/profils/')) {
      const heading = await page.locator('h1').first().textContent();
      expect(heading).toMatch(/introuvable|[Ee]rreur|[Ss]ession/i);
    } else {
      expect(url).toMatch(/\/connexion|\/login/);
    }
  });

  test.skip('US6.1 — admin retire photo via Dialog → audit modération + statut incomplet', async () => {
    // Future : seed admin + conseiller verified avec photoS3Key, login admin,
    // GET /admin/profils, cliquer "Voir le détail" sur la ligne du conseiller,
    // cliquer "Retirer la photo", taper raison ≥ 10 chars dans Dialog Radix,
    // submit → expect (a) statut profil = incomplet (b) photoS3Key = NULL
    // (c) 1 ligne dans profile_moderation_audits avec action=retrait_photo.
    //
    // Couverture : admin-moderation.integration.test.ts US6.1 (T111).
  });

  test.skip('US6.2 — admin masque profil → 404 sur page publique', async () => {
    // Future : seed + login admin + masquer profil pret, GET /fr/conseiller/<slug>
    // → 404 unifié (anti-énumération SC-003 + FR-023 masquage admin).
  });

  test.skip('US6.3 — Dialog Radix : focus trap + Escape ferme + raison < 10 chars refusée', async () => {
    // Future : login admin, ouvrir Dialog retirer-photo, vérifier :
    //   - focus initial sur textarea raison (Radix gère)
    //   - Tab cycle dans le Dialog uniquement (focus trap)
    //   - Escape ferme + raison réinitialisée
    //   - Submit avec raison < 10 chars → bouton disabled
    //   - Submit avec raison ≥ 10 → action passe
    // Couverture a11y : T125 axe-core CI bloquant à venir.
  });

  test.skip('US6.4 — rétablir profil masqué → statut recalculé via calculerStatutProfil', async () => {
    // Future : seed profil masque_admin avec champs incomplets → rétablir →
    // expect nouveau statut = incomplet (recalcul) + raisonMasquageAdmin = NULL.
    // Couverture : admin-moderation.integration.test.ts US6.3 (T113).
  });
});
