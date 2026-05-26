// @cv/auth-domain — logique pure du domaine d'authentification (feature 002).
//
// Complémentaire à @cv/mfa (002a). Pas de framework, pas d'I/O, pas de Prisma.
// TDD strict (Principe VI constitution v2.2.0).
//
// Modules :
//   - email-normalizer      : normalizeEmail (trim/lower/NFC)
//   - password-policy       : validatePasswordPolicy (12..128 chars, 4 classes)
//   - password-hash         : prehashAndHash + verifyPrehashed (SHA-256 + bcrypt 11)
//   - single-use-tokens     : issueToken + verifyToken (JWT HS256 via jose)
//   - lockout-policy        : shouldLockout (double bucket 5/15min + 20/1h)
//   - auth-error-normalizer : normalizeAuthError → INVALID_CREDENTIALS
//   - dtos/                 : Zod schemas partagés api+web
//
// À envisager fusion future avec @cv/mfa en @cv/identite-domain.

export * from './email-normalizer';
export * from './password-policy';
export * from './password-hash';
export * from './single-use-tokens';
export * from './lockout-policy';
export * from './auth-error-normalizer';
export * from './dtos';
