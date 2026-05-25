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

/**
 * Fail-fast au boot : si DATABASE_URL est absent, malformé, ou pointe
 * vers les credentials placeholder dev, on crash AVEC un message clair
 * plutôt que de laisser Prisma cracher un "Authentication failed for
 * user `x`" 100 requêtes plus tard. Évite la classe de bugs "j'ai modifié
 * .env.local mais le dev server tourne avec l'ancienne valeur en RAM".
 */
function assertDatabaseUrl(): void {
  const url = process.env.DATABASE_URL;
  if (!url || url.trim() === '') {
    throw new Error(
      '[@cv/db] DATABASE_URL manquant. Vérifie ton .env.local (apps/web) ' +
        'ou .env (apps/api / packages/db). Format attendu : ' +
        'postgresql://USER:PASS@HOST:PORT/DBNAME',
    );
  }

  // Détection des placeholders bidons hérités d'anciens fichiers .env.
  // Si tu vois ce message : ton fichier .env contient encore un
  // placeholder ; remplace-le par les vraies credentials et redémarre
  // le dev server (Ctrl+C + pnpm dev — un hot-reload ne suffit pas
  // car Next.js ne relit les fichiers .env qu'au boot).
  const placeholderPatterns = [/\/\/x:y@/, /\/\/user:pass@/i, /\/\/changeme/i];
  if (placeholderPatterns.some((p) => p.test(url))) {
    throw new Error(
      `[@cv/db] DATABASE_URL contient un placeholder bidon : ${maskUrl(url)}. Remplace par les vraies credentials (cf. docker-compose.dev.yml pour le dev : postgresql://cv_dev:cv_dev@localhost:5432/cv_dev) PUIS redémarre le dev server entièrement (Ctrl+C + pnpm dev).`,
    );
  }
}

/** Masque le mot de passe d'une URL Postgres pour log safe. */
function maskUrl(url: string): string {
  return url.replace(/(\/\/[^:]+:)([^@]+)(@)/, '$1***$3');
}

function createPrismaClient(): PrismaClient {
  // Fail-fast UNIQUEMENT en dev local (NODE_ENV=development).
  //
  // En production : Next.js `next build` collecte les page data en mode
  // production sans DATABASE_URL fourni au CI — laisser Prisma gérer
  // ses propres erreurs au premier query runtime.
  //
  // En test : Vitest tourne en NODE_ENV=test par défaut. Les tests
  // unitaires utilisent des mocks (pas besoin de DATABASE_URL). Les
  // tests d'integration injectent DATABASE_URL via le service postgres
  // du job CI — pas besoin d'une assertion sync au boot.
  //
  // En dev : on garde le fail-fast strict pour éviter les bugs silencieux
  // type "j'ai modifié .env.local mais le dev server tourne avec
  // l'ancienne valeur en RAM".
  if (process.env.NODE_ENV === 'development') {
    assertDatabaseUrl();
    console.info(`[@cv/db] PrismaClient initialisé — ${maskUrl(process.env.DATABASE_URL ?? '')}`);
  }

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
