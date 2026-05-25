// T046 + T062 — Tests e2e Playwright sur les 5 pages publiques légales
// + Footer permanent (crawl).
//
// PRÉREQUIS : dev server tournant sur localhost:3000
//   pnpm docker:up && pnpm dev

import { expect, test } from '@playwright/test';

const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';

const LEGAL_PAGES = [
  { path: '/fr/comment-ca-marche', titleContains: /Comment ça marche/i },
  { path: '/fr/mentions-legales', titleContains: /Mentions légales/i },
  { path: '/fr/cgu-voyageur', titleContains: /Conditions.*[Vv]oyageur/i },
  { path: '/fr/cgu-conseiller', titleContains: /Conditions.*[Cc]onseiller/i },
  { path: '/fr/confidentialite', titleContains: /confidentialité/i },
];

test.describe('e2e — 5 pages publiques légales (US1 + US2 P1)', () => {
  for (const { path, titleContains } of LEGAL_PAGES) {
    test(`GET ${path} renvoie 200 + titre attendu`, async ({ page }) => {
      const response = await page.goto(`${BASE_URL}${path}`);
      expect(response?.status()).toBe(200);
      await expect(page.locator('h1')).toContainText(titleContains);
    });
  }

  test('US1 — /comment-ca-marche affirme explicitement "pas une agence de voyages"', async ({
    page,
  }) => {
    await page.goto(`${BASE_URL}/fr/comment-ca-marche`);
    // L'énoncé doit être visible dans le corps de la page (pas dans le head).
    // Le texte exact du MDX est : « Conseiller Voyage n'est pas une agence de voyages »
    await expect(page.locator('main, article')).toContainText(/n[' ]est pas une agence/i);
  });

  test('JSON-LD WebPage présent sur chaque page', async ({ page }) => {
    for (const { path } of LEGAL_PAGES) {
      await page.goto(`${BASE_URL}${path}`);
      const jsonLd = await page.locator('script[type="application/ld+json"]').first().textContent();
      expect(jsonLd).toBeTruthy();
      const parsed = JSON.parse(jsonLd ?? '{}');
      expect(parsed['@type']).toBe('WebPage');
      expect(parsed.inLanguage).toBe('fr-CA');
    }
  });

  test('US5 — /mentions-legales contient un schéma Organization additionnel', async ({ page }) => {
    await page.goto(`${BASE_URL}/fr/mentions-legales`);
    const allJsonLd = await page.locator('script[type="application/ld+json"]').allTextContents();
    expect(allJsonLd.length).toBeGreaterThanOrEqual(2);
    const types = allJsonLd.map((s) => JSON.parse(s)['@type']);
    expect(types).toContain('Organization');
  });

  test('Footer crawl — les 5 liens présents sur page accueil + page conseiller (échantillon)', async ({
    page,
  }) => {
    // Test du Footer sur 2 pages différentes : la page d'accueil + une
    // page légale. Si le Footer apparaît sur ces 2 routes, c'est qu'il
    // est dans le layout racine — donc présent partout.
    const samplePaths = ['/fr', '/fr/comment-ca-marche'];
    for (const path of samplePaths) {
      await page.goto(`${BASE_URL}${path}`);
      const footer = page.locator('footer');
      await expect(footer, `Footer absent sur ${path}`).toBeVisible();

      // 5 liens vers les pages légales
      await expect(footer.getByRole('link', { name: /Mentions légales/ })).toBeVisible();
      await expect(footer.getByRole('link', { name: /CGU voyageur/ })).toBeVisible();
      await expect(footer.getByRole('link', { name: /CGU conseiller/ })).toBeVisible();
      await expect(footer.getByRole('link', { name: /Confidentialité/ })).toBeVisible();
      await expect(footer.getByRole('link', { name: /Comment ça marche/ })).toBeVisible();
    }
  });

  test('Footer responsive — touch targets ≥ 44px sur viewport mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto(`${BASE_URL}/fr/comment-ca-marche`);
    const links = page.locator('footer a');
    const count = await links.count();
    expect(count).toBeGreaterThanOrEqual(5);
    // Vérifier au moins le premier — touch target ≥ 44px (height OR width sufficient)
    const box = await links.first().boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(44);
  });

  test('Sitemap référence les 5 pages légales', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/sitemap.xml`);
    expect(response.status()).toBe(200);
    const body = await response.text();
    expect(body).toContain('/fr/comment-ca-marche');
    expect(body).toContain('/fr/mentions-legales');
    expect(body).toContain('/fr/cgu-voyageur');
    expect(body).toContain('/fr/cgu-conseiller');
    expect(body).toContain('/fr/confidentialite');
  });

  test('robots.txt autorise crawl + référence sitemap.xml', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/robots.txt`);
    expect(response.status()).toBe(200);
    const body = await response.text();
    expect(body).toContain('User-agent: *');
    expect(body).toContain('Allow: /');
    expect(body).toContain('Sitemap:');
  });
});
