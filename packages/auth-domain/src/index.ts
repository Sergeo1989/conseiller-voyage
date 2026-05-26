// @cv/auth-domain — logique pure du domaine d'authentification (feature 002).
//
// Complémentaire à @cv/mfa (002a). Pas de framework, pas d'I/O, pas de Prisma.
// TDD strict (Principe VI constitution v2.2.0).
//
// Modules ajoutés en Phase 2 (foundational) :
//   - email-normalizer    : normalizeEmail(trim/lower/NFC)
//   - password-policy     : validatePasswordPolicy (12..128 chars, 4 classes)
//   - password-hash       : prehashAndHash + verifyPrehashed (SHA-256 + bcrypt cost 11)
//   - single-use-tokens   : issueToken + verifyToken (JWT HS256 via jose)
//   - lockout-policy      : shouldLockout (double bucket 5/15min + 20/1h)
//   - auth-error-normalizer : normalizeAuthError → INVALID_CREDENTIALS (anti-énum)
//   - dtos/               : Zod schemas partagés api+web
//
// À envisager fusion future avec @cv/mfa en @cv/identite-domain si scope s'élargit.

// Placeholder Phase 1 — exports remplis au fur et à mesure que les modules
// sont implémentés en Phase 2 (TDD, tests RED puis GREEN).
export const __FEATURE_002_AUTH_DOMAIN_PLACEHOLDER__ = true;
