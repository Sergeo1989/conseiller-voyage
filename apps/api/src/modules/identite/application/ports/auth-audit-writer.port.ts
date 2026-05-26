// T039 — Port writer du journal d'audit auth (feature 002 / H7 / ADR-0012).
//
// Séparé volontairement du `mfa-audit-writer.port.ts` (002a) pour clarté de
// traçabilité et conformité aux décisions ADR-0012 (pas de FK Prisma vers
// auth_users — corrélation post-effacement via targetEmailHash).

import type { Prisma } from '@cv/db';

export type AuthAuditEventType =
  | 'signup'
  | 'email_verified'
  | 'login_success'
  | 'login_failed'
  | 'login_locked'
  | 'logout'
  | 'password_reset_requested'
  | 'password_reset_completed'
  | 'password_changed_self'
  | 'password_change_failed'
  | 'admin_bootstrap'
  | 'admin_invitation_sent'
  | 'admin_invitation_consumed'
  | 'admin_created_by_admin';

export interface AppendAuthAuditInput {
  readonly eventType: AuthAuditEventType;
  readonly actorUserId?: string | null;
  readonly targetUserId?: string | null;
  /** Email normalisé du caller (sera hashé SHA-256 par l'adapter). */
  readonly actorEmail?: string | null;
  /** Email normalisé du sujet (sera hashé SHA-256 par l'adapter). */
  readonly targetEmail?: string | null;
  readonly actorIp?: string | null;
  readonly metadata?: Prisma.JsonObject;
}

export interface AuthAuditWriter {
  append(input: AppendAuthAuditInput): Promise<void>;
}

export const AUTH_AUDIT_WRITER = Symbol.for('AuthAuditWriter');
