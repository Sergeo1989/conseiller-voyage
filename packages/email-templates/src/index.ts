// Barrel d'export de @cv/email-templates.
// Templates react-email pour les courriels transactionnels MFA (T060
// Phase 2) et au-delà (003 — notifications + courriels transactionnels).
//
// Cf. specs/005-mfa-conseiller/plan.md § packages/email-templates (P1-3).

export * from './auth';
export * from './conformite';
export * from './mfa';

export const EMAIL_TEMPLATES_PACKAGE_VERSION = '0.1.0';
