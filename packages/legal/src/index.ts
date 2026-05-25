// @cv/legal — partagé entre apps/api (use cases identité) et apps/web
// (middleware + composants legal). Tout ici est pur TypeScript : zéro
// import NestJS, Next.js, Prisma. Les fonctions exportées sont
// déterministes et testées TDD (Principe VI de la constitution).

export * from './branded-ids';
export * from './document-types';
export * from './schemas';
export * from './version';
export * from './anonymization';
export * from './cookie-hmac';
export * from './mdx-validation';
