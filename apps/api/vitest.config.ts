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
