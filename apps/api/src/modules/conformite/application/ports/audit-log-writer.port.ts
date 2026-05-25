// Port AuditLogWriter — écriture append-only du journal d'audit.
// L'implémentation Prisma (T062) valide chaque payload contre les schémas
// Zod par eventType (T046) et rejette toute clé PII interdite (B5 / R10).

import type { ConseillerComplianceId } from '@cv/shared/conformite';
import type { ActorRole, AuditEventType } from '../../domain/entities/audit-entry.entity';

export interface AuditEntryToCreate {
  readonly conseillerComplianceId: ConseillerComplianceId | null;
  readonly eventType: AuditEventType;
  readonly actorId: string | null;
  readonly actorRole: ActorRole;
  readonly payload: Record<string, unknown>;
  readonly idempotencyKey: string | null;
  readonly correlationId: string | null;
}

export interface AuditLogWriter {
  /** Append une entrée. Lève si payload non conforme au schéma de l'eventType. */
  write(entry: AuditEntryToCreate): Promise<void>;
}

export const AUDIT_LOG_WRITER = Symbol.for('AuditLogWriter');
