// T061 — Mapping AuthEmailTemplate enum → templateId react-email.
// Cf. outbox-source-contract.md section 6 (auth).

import type { AuthEmailTemplate } from '../../application/ports/auth-outbox-writer.port';

export function mapAuthTemplateKindToTemplateId(kind: AuthEmailTemplate): string {
  switch (kind) {
    case 'email_verification':
      return 'auth.email-verification';
    case 'password_reset':
      return 'auth.password-reset';
    case 'password_changed':
      return 'auth.password-changed';
    case 'admin_invitation':
      return 'auth.admin-invitation';
  }
}
