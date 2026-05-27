import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    // Pattern relatif au répertoire courant (configurable via `--dir`).
    // Combiné à `vitest run` (racine), il capte src/**/*.test.ts ET
    // test/**/*.test.ts. Combiné à `--dir src`, il restreint à src/.
    include: ['**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    reporters: ['default'],
    // Charge .env avant tout import (env.ts valide process.env au
    // chargement du module et appelle process.exit(1) si invalide).
    setupFiles: ['./test/setup.ts'],
    // Les tests d'intégration partagent une DB Postgres unique. Les
    // teardown font deleteMany({}) sur certaines tables ; deux files
    // exécutés en parallèle se polluent mutuellement. Forcer séquentiel.
    fileParallelism: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/__tests__/**',
        'src/main.ts',
        'src/instrumentation.ts',
        'src/env.ts',
      ],
    },
  },
});
