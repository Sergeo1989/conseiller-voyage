import { defineConfig } from 'vitest/config';

/**
 * Config Vitest côté @cv/web — exclut explicitement les tests destinés
 * à Playwright (e2e + a11y) qui sont lancés via leurs scripts dédiés :
 *   - `pnpm --filter @cv/web test:e2e`   → playwright test
 *   - `pnpm --filter @cv/web test:a11y`  → playwright test --grep @a11y
 *
 * Sans cette exclusion, Vitest essaye de charger les fichiers
 * `test/a11y/*.spec.ts` qui importent `@axe-core/playwright`
 * (dépendance résolue uniquement dans le runtime Playwright).
 */
export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['test/**/*.test.ts', 'src/**/*.test.ts', 'src/**/*.test.tsx'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/.next/**', 'test/e2e/**', 'test/a11y/**'],
  },
});
