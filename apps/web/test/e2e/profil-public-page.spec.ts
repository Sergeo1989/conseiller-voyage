// T073 — Tests e2e Playwright sur la page publique conseiller (feature 007 US2).
//
// **Scope sans seed DB** : seuls les invariants HTTP-level vérifiables
// sans seeder de profils. Les cas qui exigent un profil pret avec un
// slug actif (page nominale, JSON-LD complet, CTA /intake) sont couverts
// par les 7 tests intégration (lire-page-profil-publique.integration.test.ts).
//
// PRÉREQUIS : dev server tournant sur localhost:3000
//   pnpm docker:up && pnpm dev

import { expect, test } from '@playwright/test';

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3000';

test.describe('e2e — page publique conseiller (T073, anti-énumération SC-003)', () => {
  test('slug inexistant → 404 + page not-found unifiée', async ({ page }) => {
    const response = await page.goto(`${BASE}/fr/conseiller/cet-slug-nexiste-vraiment-pas-2026`);
    expect(response?.status()).toBe(404);
    await expect(page.locator('h1')).toContainText(/Page introuvable/i);
  });

  test('slug réservé Loi 25 → même 404 unifié (pas de fuite)', async ({ page }) => {
    // Format de slug typique post-anonymisation : `prenom-nom` simple.
    // Sans seeder un slug réservé, on vérifie au moins que les slugs qui
    // ressemblent à des slugs anonymisés produisent le même 404 unifié
    // (signature HTTP identique au cas "inexistant").
    const response = await page.goto(`${BASE}/fr/conseiller/marie-dupont-anonymise-test`);
    expect(response?.status()).toBe(404);
    await expect(page.locator('h1')).toContainText(/Page introuvable/i);
  });

  test('SC-003 — body identique sur 2 slugs 404 différents (constant-body)', async ({
    request,
  }) => {
    // L'invariant le plus important : 2 cas 404 distincts (slug inexistant
    // vs slug "ressemblant à anonymisé") doivent produire un HTML strictement
    // identique. Toute différence (longueur, contenu) leak l'existence.
    const r1 = await request.get(`${BASE}/fr/conseiller/profil-fantome-aaaa`);
    const r2 = await request.get(`${BASE}/fr/conseiller/profil-fantome-bbbb`);
    expect(r1.status()).toBe(404);
    expect(r2.status()).toBe(404);

    const body1 = await r1.text();
    const body2 = await r2.text();
    // Comparaison de la longueur ET du contenu visible (h1 + description).
    // Le HTML complet peut différer sur des nonces CSP, donc on extrait
    // le segment <main>...</main> et on compare.
    const main1 = extractMain(body1);
    const main2 = extractMain(body2);
    expect(main1).toBeTruthy();
    expect(main1).toBe(main2);
  });

  test('SC-002 — page 404 conseiller ne contient AUCUN canal de contact', async ({ page }) => {
    await page.goto(`${BASE}/fr/conseiller/inconnu-test`);
    const main = await page.locator('main').textContent();
    expect(main).toBeTruthy();
    // Anti-marketplace : pas de courriel / téléphone / chat externe
    expect(main).not.toMatch(/mailto:|tel:|sms:/i);
    expect(main).not.toMatch(/whatsapp|messenger|telegram/i);
    expect(main).not.toMatch(/\bcontact(er|ez)\b/i);
  });

  test('404 ne pose pas de cookie cv_suggested (anti-pollution)', async ({ page, context }) => {
    await context.clearCookies();
    await page.goto(`${BASE}/fr/conseiller/inconnu-test-cookie`);
    const cookies = await context.cookies();
    const suggested = cookies.find((c) => c.name === 'cv_suggested');
    expect(suggested).toBeUndefined();
  });

  test.skip('verified + pret + champs complets → JSON-LD Person SANS contactPoint', async () => {
    // Future : seed un profil pret + verified, GET /fr/conseiller/<slug>,
    // parse <script type="application/ld+json"> et vérifier :
    //   - parsed['@type'] === 'Person'
    //   - parsed.contactPoint === undefined
    //   - parsed.telephone === undefined
    //   - parsed.email === undefined
    // Couverture comportementale : intégration lire-page-profil-publique
    // (test 6 "verified + pret + champs complets → payload nominal").
  });

  test.skip('verified + pret → CTA unique vers /intake?suggested= (FR-008)', async () => {
    // Future : seed + GET → vérifier un seul lien <a href="/intake...">.
    // Couverture : check-no-contact-fields-profile.ts (CI bloquant).
  });
});

/**
 * Extrait le contenu de <main>...</main> pour comparaison robuste indépendante
 * des nonces CSP qui changent à chaque request.
 */
function extractMain(html: string): string {
  const match = html.match(/<main[^>]*>([\s\S]*?)<\/main>/);
  return match?.[1]?.trim() ?? '';
}
