// Port MfaAuditWriter — écriture append-only du journal d'audit MFA.
// Cf. specs/005-mfa-conseiller/contracts/events.md.
//
// Le port n'expose PAS d'update/delete par construction — la table est
// append-only au niveau BD (triggers Postgres) et l'interface
// applicative reflète cette contrainte.

import type { MfaEventType, MfaVerifyMethod } from '../../domain/value-objects/mfa-event-type.vo';
import type { AuthRole } from './auth-session-reader.port';

export interface MfaAuditEventToAppend {
  readonly eventType: MfaEventType;
  readonly actorUserId: string | null;
  readonly targetUserId: string | null;
  readonly targetRole?: AuthRole;
  readonly actorIp?: string;
  readonly method?: MfaVerifyMethod;
  readonly justification?: string;
  readonly metadata?: Record<string, unknown>;
}

export interface MfaAuditWriter {
  /**
   * Append un événement au journal. L'IP source DOIT être déjà abrégée
   * par le caller (IPv4 /24, IPv6 /48) — le port ne fait pas l'abrégement
   * pour éviter d'inclure une dépendance ici.
   *
   * Idempotent au niveau BD via le timestamp `occurredAt` géré par
   * Postgres. Aucune contrainte unique côté event — un événement
   * dupliqué (retry réseau) crée 2 lignes, ce qui est acceptable pour
   * un journal d'audit (les doublons sont visibles côté observabilité).
   */
  append(event: MfaAuditEventToAppend): Promise<void>;
}

export const MFA_AUDIT_WRITER = Symbol.for('MfaAuditWriter');
