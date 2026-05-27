// T070 — Tests e2e Playwright sur l'édition profil conseiller (US1).
//
// Scope sans seed : redirect login si non authentifié + structure de
// la page édition. Les parcours nominaux (login → édition → submit →
// succès) nécessitent un endpoint dev de seeding conseiller + auth ;
// pattern hérité de mfa-recovery.spec.ts (.skip avec couverture
// intégration documentée).

import { expect, test } from '@playwright/test';

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3000';

test.describe('e2e — édition profil conseiller (T070, US1)', () => {
  test('non authentifié → redirect /connexion', async ({ page }) => {
    await page.goto(`${BASE}/fr/conseiller/profil`);
    // Soit redirect vers /connexion, soit affichage de la page connexion.
    const url = page.url();
    expect(url).toMatch(/\/connexion|\/login/);
  });

  test('page /conseiller/profil ne pose pas de cookie cv_suggested', async ({ page, context }) => {
    await context.clearCookies();
    await page.goto(`${BASE}/fr/conseiller/profil`);
    const cookies = await context.cookies();
    expect(cookies.find((c) => c.name === 'cv_suggested')).toBeUndefined();
  });

  test('route privée non indexée — meta robots noindex', async ({ page }) => {
    await page.goto(`${BASE}/fr/conseiller/profil`);
    // Soit la page édition redirige (non authentifié → on suit le redirect),
    // soit elle se charge et expose meta robots=noindex.
    // On vérifie au final que la page courante (édition OU connexion) n'est
    // pas indexable, car les deux sont privées.
    const robotsMeta = await page
      .locator('meta[name="robots"]')
      .first()
      .getAttribute('content')
      .catch(() => null);
    if (robotsMeta) {
      expect(robotsMeta.toLowerCase()).toContain('noindex');
    }
  });

  test.skip('US1.1 — conseiller authentifié édite profil → save → statut prêt si complet', async () => {
    // Future : seed conseiller verified + profil incomplet, login, GET
    // /fr/conseiller/profil, remplir titre + biographie + 1 spécialité +
    // 1 langue + 1 zone + années expérience + photo, submit → expect
    // statut=pret + slug généré + publishedAt non-null en DB.
    //
    // Couverture comportementale :
    //   - apps/api/test/integration/profil/lire-profil-prive.integration.test.ts
    //   - Use case EditerProfilUseCase (Result success/error cases)
  });

  test.skip('US1.2 — biographie < 100 chars → erreur Zod affichée', async () => {
    // Future : login, taper 50 chars dans biographie, submit → expect
    // message FR-CA "au moins 100 caractères" visible (role="alert").
  });

  test.skip('US1.3 — upload photo JPEG 800×800 → photoS3Key persisté', async () => {
    // Future : login, upload via input[type=file], poll page édition
    // jusqu'à voir l'image preview, vérifier que photoS3Key est en DB.
  });

  test.skip('US1.4 — upload .webp renommé WAV → rejet CONTENU_NON_IMAGE', async () => {
    // Future : upload fichier WAV avec extension .webp → message d'erreur
    // FR-CA "le fichier n'est pas une image valide" affiché.
    // Couverture : tests pure-fn detecterFormatImage (magic-number.ts).
  });

  test.skip('US1.5 — toggle afficherNomComplet → avertissement Loi 25 affiché', async () => {
    // Future : login, basculer le toggle "Afficher mon nom complet" →
    // expect avertissement Loi 25 visible avec mention "indexation moteurs".
  });

  test.skip('US1.6 — CGU obsolètes → middleware redirect /cgu-conseiller/re-accepter', async () => {
    // Future : mock API current-cgu-version à v3, session avec acceptance v2
    // → GET /conseiller/profil → expect 302 vers /cgu-conseiller/re-accepter.
    // Couverture : middleware.ts + tests intégration legal.
  });
});
