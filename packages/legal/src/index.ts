// @cv/legal — partagé entre apps/api (use cases identité) et apps/web
// (middleware + composants legal). Tout ici est pur TypeScript : zéro
// import NestJS, Next.js, Prisma. Les fonctions exportées sont
// déterministes et testées TDD (Principe VI de la constitution).
//
// **NOTE bundler** : `mdx-validation.ts` (gray-matter → node:crypto) et
// `anonymization.ts` (createHash → node:crypto) ne sont PAS exportés
// ici parce qu'ils sont incompatibles avec le bundler webpack/edge
// runtime de Next.js. Le code serveur qui en a besoin les importe
// directement via les subpaths `@cv/legal/mdx-validation` et
// `@cv/legal/anonymization`. Le cookie-hmac utilise Web Crypto API
// (Edge-compatible) et reste dans le barrel.

export * from './branded-ids';
export * from './document-types';
export * from './schemas';
export * from './version';
export * from './cookie-hmac';
