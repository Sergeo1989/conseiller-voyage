// T104 — Tests e2e admin reset flow (US4).
//
// Note : .skip jusqu'à seeded admin + cible. Couverture comportementale
// par les 5 tests d'intégration apps/api (reset-admin-flow).

import { expect, test } from '@playwright/test';

test.describe('Admin Reset MFA (US4)', () => {
  test('redirect to login when no session', async ({ page }) => {
    await page.goto('/fr/admin/users/00000000-0000-4000-8000-aaaa00000001/reset-mfa');
    const url = page.url();
    expect(url).toMatch(/\/login|\/reset-mfa/);
  });

  test.skip('US4.1 — justification < 20 chars → bouton désactivé', async () => {
    // Future : login admin, saisir justification courte, vérifier
    // que le bouton submit est disabled.
  });

  test.skip('US4.2 — justification valide → reset effectif + audit', async () => {
    // Future : seed conseiller enrolled, login admin, saisir
    // justification + submit, vérifier que les sessions cible
    // sont invalidées et l'audit est présent.
  });

  test.skip('US4.5 — auto-reset sur sa propre fiche → bouton désactivé', async () => {
    // Future : login admin, naviguer vers /admin/users/<son-id>/reset-mfa,
    // vérifier qu'on voit "Auto-reset interdit".
  });

  test.skip('US4.6 — reset du dernier autre admin → avertissement visible', async () => {
    // Future : seed exactement 2 admins, login l'un et essayer reset
    // l'autre, vérifier que le warning amber FR-026b apparaît.
  });
});
