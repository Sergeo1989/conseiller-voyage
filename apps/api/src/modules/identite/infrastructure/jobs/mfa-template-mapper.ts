// T074 — Mapping MfaEmailTemplateKind enum → templateId react-email.
// Cf. outbox-source-contract.md section 2.3.

export type MfaEmailTemplateKind =
  | 'login_locked'
  | 'stepup_session_killed'
  | 'admin_reset'
  | 'device_changed'
  | 'device_change_incomplete';

export function mapMfaTemplateKindToTemplateId(kind: MfaEmailTemplateKind): string {
  switch (kind) {
    case 'login_locked':
      return 'mfa.login-locked';
    case 'stepup_session_killed':
      return 'mfa.stepup-session-killed';
    case 'admin_reset':
      return 'mfa.admin-reset';
    case 'device_changed':
      return 'mfa.device-changed';
    case 'device_change_incomplete':
      return 'mfa.device-change-incomplete';
  }
}
