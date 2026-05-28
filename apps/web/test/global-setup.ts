// T146c — Global setup Playwright : seed les sessions E2E via le Route
// Handler dev `/api/_dev/seed-session` et expose les tokens via env vars
// `E2E_CONSEILLER_SESSION` / `E2E_ADMIN_SESSION`, consommés par les
// `test.skip(!ENV_VAR, ...)` patterns dans test/a11y/ et test/e2e/.
//
// Activé uniquement si :
//   - process.env.E2E_SEED_ENABLED === 'true'
//   - process.env.DEV_SEED_TOKEN configuré (32 chars min)
//   - apps/web tourne avec ENABLE_DEV_ENDPOINTS=true
//
// Sans ces conditions, les tests authentifiés restent en `.skip` (la
// couverture comportementale est assurée par les tests d'intégration
// Testcontainers côté apps/api).

import type { FullConfig } from '@playwright/test';

async function seedRole(
  baseUrl: string,
  role: 'conseiller' | 'admin',
  profilStatut?: 'incomplet' | 'pret',
): Promise<string | null> {
  const res = await fetch(`${baseUrl}/api/_dev/seed-session`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Dev-Seed-Authorization': process.env.DEV_SEED_TOKEN ?? '',
    },
    body: JSON.stringify({ role, ...(profilStatut && { profilStatut }) }),
  });
  if (!res.ok) {
    console.warn(`[globalSetup] seed ${role} → HTTP ${res.status}, fallback skip tests`);
    return null;
  }
  const { sessionToken } = (await res.json()) as { sessionToken: string };
  return sessionToken;
}

export default async function globalSetup(_config: FullConfig): Promise<void> {
  if (process.env.E2E_SEED_ENABLED !== 'true') {
    console.info('[globalSetup] E2E_SEED_ENABLED != true — tests authentifiés en skip');
    return;
  }
  if ((process.env.DEV_SEED_TOKEN ?? '').length < 32) {
    console.warn('[globalSetup] DEV_SEED_TOKEN absent ou trop court — tests authentifiés en skip');
    return;
  }

  const baseUrl = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000';

  const conseillerToken = await seedRole(baseUrl, 'conseiller', 'pret');
  const adminToken = await seedRole(baseUrl, 'admin');

  if (conseillerToken) {
    process.env.E2E_CONSEILLER_SESSION = conseillerToken;
    console.info('[globalSetup] E2E_CONSEILLER_SESSION seeded');
  }
  if (adminToken) {
    process.env.E2E_ADMIN_SESSION = adminToken;
    console.info('[globalSetup] E2E_ADMIN_SESSION seeded');
  }
}
