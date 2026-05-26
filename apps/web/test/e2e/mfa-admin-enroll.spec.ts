// T109 — Tests e2e admin MFA J1 obligatoire (US5).
//
// Note : .skip jusqu'à seeded admin sans MFA actif. La page côté serveur
// fait les checks que le test exercerait — couverture par les pages
// Server Component qui rejettent ou redirigent.

import { expect, test } from '@playwright/test';

test.describe('Admin MFA J1 obligatoire (US5)', () => {
  test('redirect to login when no session', async ({ page }) => {
    await page.goto('/fr/admin/mfa/enroll');
    const url = page.url();
    expect(url).toMatch(/\/login|\/admin\/mfa\/enroll/);
  });

  test.skip('US5.1 — nouvel admin → /admin/mfa/enroll bloque l accès à /admin', async () => {
    // Future : seed admin sans MFA, naviguer vers /admin/users/<id>/reset-mfa,
    // vérifier redirect vers /admin/mfa/enroll.
  });

  test.skip('US5.2 — admin enrôlé + action sensible session > 30 min → modal step-up', async () => {
    // Future : seed admin avec mfaVerifiedAt = NOW - 31 min, déclencher
    // resetUserMfaAdminAction sur un autre user, vérifier que le modal
    // step-up s'ouvre (RoleGuard + StepUpGuard déjà composés côté API).
  });

  test.skip('US5.3 — 3 échecs step-up admin → session invalidée + audit hautement prioritaire', async () => {
    // Future : 3 échecs dans le modal step-up, vérifier le redirect
    // login + audit avec metadata.priority === 'high' (à ajouter dans
    // le use case si jugé pertinent en polish Phase 9).
  });
});
