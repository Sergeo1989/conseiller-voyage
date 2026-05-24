// T081 — Configuration Playwright pour le module conformité.
//
// Stratégie : un seul navigateur (Chromium) en MVP, ajouts Firefox/
// WebKit quand les tests stabiliseront. Pas de retries en local,
// 2 retries en CI (flakiness occasionnelle réseau).
//
// PRÉREQUIS RUNTIME (cf. test/e2e/README.md) :
//   - docker compose up (postgres + redis + localstack)
//   - migrations Prisma appliquées
//   - apps/api lancé sur :3001
//   - apps/web lancé sur :3000
//   - Playwright binaires installés : `pnpm exec playwright install chromium`

import { defineConfig, devices } from '@playwright/test';

const isCI = !!process.env.CI;

export default defineConfig({
  testDir: './test/e2e',
  fullyParallel: false, // les tests partagent la même DB → séquentiels
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: 1,
  reporter: isCI ? [['github'], ['html', { open: 'never' }]] : 'list',
  timeout: 30_000,

  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    locale: 'fr-CA',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
