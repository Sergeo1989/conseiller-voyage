// Barrel d'export de @cv/mfa.
// Logique pure MFA (TOTP, backup codes, chiffrement, freshness, schemas).
// Aucun framework — sera consommé par apps/api (NestJS) et apps/web (Server Actions).
//
// Cf. specs/005-mfa-conseiller/plan.md § packages/mfa.

// Exports ajoutés au fil des tâches Phase 2 (T023-T029) :
//   export * from './totp';          // T023
//   export * from './backup-codes';  // T024
//   export * from './encryption';    // T025
//   export * from './freshness';     // T026
//   export * from './schemas';       // T027
//   export * from './errors';        // T028
// Pour T001 (Phase 1 Setup), le package compile à vide.
export const MFA_PACKAGE_VERSION = '0.0.0';
