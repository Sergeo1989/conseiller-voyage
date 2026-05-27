// T040 — Port writer de l'outbox de courriels auth (feature 002).
//
// Stub MVP : INSERT dans auth_outbox_emails. Drainée par feature 003 (SES).
// Pattern aligné sur mfa_outbox_emails de 002a.

import type { Prisma } from '@cv/db';

export type AuthEmailTemplate =
  | 'email_verification'
  | 'password_reset'
  | 'password_changed'
  | 'admin_invitation';

export interface EnqueueAuthEmailInput {
  readonly recipientUserId?: string | null;
  readonly recipientEmail: string;
  readonly templateKind: AuthEmailTemplate;
  readonly payload: Prisma.JsonObject;
}

export interface AuthOutboxWriter {
  enqueue(input: EnqueueAuthEmailInput): Promise<void>;
}

export const AUTH_OUTBOX_WRITER = Symbol.for('AuthOutboxWriter');
