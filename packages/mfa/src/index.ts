// Barrel d'export de @cv/mfa.
// Logique pure MFA (TOTP, backup codes, chiffrement, freshness, schemas).
// Aucun framework — consommée par apps/api (NestJS) et apps/web (Server
// Actions).
//
// Cf. specs/005-mfa-conseiller/plan.md § packages/mfa.

export * from './backup-codes';
export * from './encryption';
export * from './errors';
export * from './freshness';
export * from './schemas';
export * from './totp';

export const MFA_PACKAGE_VERSION = '0.1.0';
