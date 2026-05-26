// Types d'événements d'audit MFA — miroir TypeScript de l'enum
// MfaEventType côté Prisma (mfa.prisma).
// Cf. specs/005-mfa-conseiller/contracts/events.md.

export const MFA_EVENT_TYPES = [
  // Enrôlement et activation
  'mfa_enrollment_started',
  'mfa_enrolled',
  'mfa_enrollment_cancelled',
  // Vérifications au login
  'mfa_login_verified',
  'mfa_login_failed',
  'mfa_login_locked',
  'mfa_login_unlocked',
  // Step-up intra-session
  'mfa_stepup_verified',
  'mfa_stepup_failed',
  'mfa_stepup_session_killed',
  // Backup codes
  'mfa_backup_code_consumed',
  'mfa_backup_codes_regenerated_self',
  'mfa_backup_codes_warning_low',
  // Device change auto-service (US6)
  'mfa_device_changed_self',
  // Reset admin (US4)
  'mfa_reset_by_admin',
  // Loi 25
  'mfa_secret_anonymized',
] as const;

export type MfaEventType = (typeof MFA_EVENT_TYPES)[number];

export const MFA_VERIFY_METHODS = ['totp', 'backup_code'] as const;
export type MfaVerifyMethod = (typeof MFA_VERIFY_METHODS)[number];
