// Barrel d'exports du paquet partagé.
// Sous-paquets remplis au fur et à mesure :
//   conformite/ — schémas Zod, ports, types (T027, T044-T046, T067, T074)
//   auth/        — schéma Prisma Auth.js partagé entre apps/api et apps/web (T017)
export * from './conformite/index';
export * from './auth/index';
