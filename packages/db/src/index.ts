// @cv/db — Source unique de vérité du schéma de données Conseiller Voyage.
// Expose un PrismaClient singleton consommable par apps/api et apps/web.
//
// Le pattern singleton (préservé en dev via globalThis) évite la création
// de multiples PrismaClient instances quand Next.js hot-reload ou quand
// plusieurs modules NestJS importent ce package.

import { PrismaClient } from '@prisma/client';

declare global {
  // eslint-disable-next-line no-var
  var __cvPrisma: PrismaClient | undefined;
}

function createPrismaClient(): PrismaClient {
  return new PrismaClient({
    log:
      process.env.NODE_ENV === 'development'
        ? ['query', 'info', 'warn', 'error']
        : ['warn', 'error'],
  });
}

export const prisma: PrismaClient = globalThis.__cvPrisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalThis.__cvPrisma = prisma;
}

// Re-export des types générés par Prisma pour consommation par les apps.
export * from '@prisma/client';
