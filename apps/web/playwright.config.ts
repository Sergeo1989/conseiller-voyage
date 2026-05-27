// Configuration Playwright pour apps/web — tests e2e et a11y du MFA.
//
// Stratégie : Chromium uniquement en MVP. Tests filtrés par tag :
//   - `pnpm test:e2e`  → tous les tests sauf @a11y (rapides)
//   - `pnpm test:a11y` → uniquement les tests taggés @a11y
//
// PRÉREQUIS RUNTIME :
//   - apps/web lancé sur :3000
//   - apps/api lancé sur :3001 (pour les tests qui ne mock pas l'API)
//   - Playwright binaires installés : `pnpm exec playwright install chromium`

import { defineConfig, devices } from '@playwright/test';

const isCI = !!process.env.CI;

export default defineConfig({
  testDir: './test',
  fullyParallel: false,
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
