// Entité MfaAuditEvent — événement append-only du journal d'audit MFA.
// Cf. specs/005-mfa-conseiller/data-model.md § MfaAuditEvent.
// Cf. specs/005-mfa-conseiller/contracts/events.md.

import type { AuthRole } from '../../application/ports/auth-session-reader.port';
import type { MfaEventType, MfaVerifyMethod } from '../value-objects/mfa-event-type.vo';

export interface MfaAuditEvent {
  readonly id: string; // UUID
  readonly eventType: MfaEventType;
  readonly actorUserId: string | null; // UUID auth_users
  readonly targetUserId: string | null; // UUID auth_users
  readonly targetRole: AuthRole | null;
  readonly actorIp: string | null; // abrégée (IPv4 /24, IPv6 /48) — ADR-0008
  readonly method: MfaVerifyMethod | null;
  readonly justification: string | null; // ≥ 20 chars pour les events admin
  readonly metadata: Record<string, unknown> | null;
  readonly occurredAt: Date;
}
