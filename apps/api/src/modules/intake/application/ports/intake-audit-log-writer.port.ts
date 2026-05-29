// Port IntakeAuditLogWriter — écriture append-only dans intake_audit_entries.
// Le trigger SQL T014 garantit l'invariant côté DB ; ce port garantit
// la même chose côté code (INSERT uniquement, jamais UPDATE/DELETE).

import type { IntakeAuditEntryId, VoyageurBriefId, VoyageurContactId } from '@cv/shared/intake';

export type IntakeActorRole = 'voyageur' | 'admin' | 'system' | 'conseiller';

export interface IntakeAuditEntryInput {
  readonly id: IntakeAuditEntryId;
  readonly voyageurBriefId: VoyageurBriefId | null;
  readonly voyageurContactId: VoyageurContactId | null;
  readonly eventType: string; // ex: 'intake.brief.submitted', 'intake.brief.verified', …
  readonly actorRole: IntakeActorRole;
  readonly actorId: string | null;
  readonly occurredAt: Date;
  readonly payload: Record<string, unknown>;
  readonly idempotencyKey: string | null;
  readonly correlationId: string | null;
}

export interface IntakeAuditLogWriter {
  append(entry: IntakeAuditEntryInput): Promise<void>;
}

export const INTAKE_AUDIT_LOG_WRITER = Symbol.for('IntakeAuditLogWriter');
