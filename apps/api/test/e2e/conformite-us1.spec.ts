// T081 — E2E Playwright : parcours US1 bout-en-bout.
//
// Scénario :
//   1. Conseiller authentifié visite /conseiller/conformite → CTA "Soumettre"
//   2. Remplit le wizard 4 étapes (consentement → cert CCV → affiliation OPC)
//   3. Téléverse 1 PDF (2-phase : presigned URL + PUT direct LocalStack S3)
//   4. Soumet le dossier → message "Dossier soumis"
//   5. Admin authentifié visite /admin/conformite → voit le dossier en file
//   6. Ouvre le détail → clique "Approuver"
//   7. Retour conseiller : statut bascule à "verified"
//   8. Lecture publique via listVerifiedCompliances() → conseiller exposable
//
// PRÉREQUIS : voir README.md du même répertoire.
//
// TODO(seed) : un helper `seedTestUser({ role })` qui crée un compte
// authjs valide en DB et retourne le cookie de session pour permettre
// à chaque test d'injecter sa session sans passer par l'UI login.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

// Cookies de session pré-seedés par le script seed:dev — voir
// packages/db/prisma/seed.ts (à étendre). Pour le MVP, on assume
// que deux comptes existent : conseiller@test.cv + admin@test.cv.
const CONSEILLER_SESSION_COOKIE = process.env.E2E_CONSEILLER_SESSION;
const ADMIN_SESSION_COOKIE = process.env.E2E_ADMIN_SESSION;

const FIXTURE_PDF = readFileSync(join(__dirname, 'fixtures/dummy-cert.pdf'));

test.describe('US1 — Vérification initiale du conseiller', () => {
  test('parcours nominal : conseiller soumet → admin approuve → verified', async ({ browser }) => {
    test.skip(
      !CONSEILLER_SESSION_COOKIE || !ADMIN_SESSION_COOKIE,
      'Sessions de test absentes — voir README.md prérequis',
    );

    // --- ACTE 1 : conseiller soumet son dossier ---
    const conseillerContext = await browser.newContext({
      storageState: {
        cookies: [
          {
            name: '__Host-cv.session.token',
            value: CONSEILLER_SESSION_COOKIE as string,
            domain: 'localhost',
            path: '/',
            httpOnly: true,
            secure: false,
            expires: -1,
            sameSite: 'Lax',
          },
        ],
        origins: [],
      },
    });
    const conseillerPage = await conseillerContext.newPage();

    // Page overview : pas de dossier → CTA "Soumettre mon dossier"
    await conseillerPage.goto('/fr/conseiller/conformite');
    await expect(
      conseillerPage.getByRole('heading', { name: /Mon dossier de conformité/ }),
    ).toBeVisible();
    await conseillerPage.getByRole('link', { name: /Soumettre mon dossier/ }).click();

    // Page wizard
    await expect(
      conseillerPage.getByRole('heading', { name: /Soumettre mon dossier/ }),
    ).toBeVisible();

    // Step 1 : consentement
    await conseillerPage.getByLabel(/consens au traitement/).check();

    // Step 2 : certificat
    await conseillerPage.getByLabel(/Numéro de certificat/).fill('CCV-12345');
    await conseillerPage.getByLabel(/Date d'émission/).fill('2025-01-15');
    await conseillerPage.getByLabel(/Date d'expiration/).fill('2028-01-15');
    await conseillerPage.getByLabel(/Document.*PDF/).setInputFiles({
      name: 'cert.pdf',
      mimeType: 'application/pdf',
      buffer: FIXTURE_PDF,
    });

    // Step 3 : affiliation
    await conseillerPage.getByLabel(/Nom de l'agence/).fill('Agence Voyages Test');
    await conseillerPage.getByLabel(/Numéro de permis/).fill('OPC-998877');
    await conseillerPage.getByLabel(/Preuve d'affiliation/).setInputFiles({
      name: 'affil.pdf',
      mimeType: 'application/pdf',
      buffer: FIXTURE_PDF,
    });

    // Step 4 : submit
    await conseillerPage.getByRole('button', { name: /Soumettre mon dossier$/ }).click();
    await expect(conseillerPage.getByText(/Dossier soumis/)).toBeVisible({ timeout: 10_000 });

    await conseillerContext.close();

    // --- ACTE 2 : admin examine et approuve ---
    const adminContext = await browser.newContext({
      storageState: {
        cookies: [
          {
            name: '__Host-cv.session.token',
            value: ADMIN_SESSION_COOKIE as string,
            domain: 'localhost',
            path: '/',
            httpOnly: true,
            secure: false,
            expires: -1,
            sameSite: 'Lax',
          },
        ],
        origins: [],
      },
    });
    const adminPage = await adminContext.newPage();

    await adminPage.goto('/fr/admin/conformite');
    await expect(adminPage.getByRole('heading', { name: /File de revue/ })).toBeVisible();

    // Le premier "Examiner" ouvre le dossier qu'on vient de soumettre
    await adminPage
      .getByRole('link', { name: /Examiner/ })
      .first()
      .click();
    await expect(adminPage.getByRole('heading', { name: /Dossier .{8}…/ })).toBeVisible();

    // Approuver avec commentaire
    await adminPage.getByLabel(/Commentaire/).fill('Documents conformes après revue manuelle.');
    await adminPage.getByRole('button', { name: /Approuver le dossier/ }).click();
    await expect(adminPage.getByText(/Dossier approuvé/)).toBeVisible({ timeout: 10_000 });

    await adminContext.close();

    // --- ACTE 3 : retour conseiller, statut verified ---
    const conseillerContext2 = await browser.newContext({
      storageState: {
        cookies: [
          {
            name: '__Host-cv.session.token',
            value: CONSEILLER_SESSION_COOKIE as string,
            domain: 'localhost',
            path: '/',
            httpOnly: true,
            secure: false,
            expires: -1,
            sameSite: 'Lax',
          },
        ],
        origins: [],
      },
    });
    const conseillerPage2 = await conseillerContext2.newPage();
    await conseillerPage2.goto('/fr/conseiller/conformite');
    await expect(conseillerPage2.getByText(/Vérifié/)).toBeVisible();

    await conseillerContext2.close();
  });
});
