// T040 — Entité AuditEntry (journal d'audit append-only).
// Cf. data-model.md *AuditEntry* + R10 (pseudonymisation des payloads).
//
// Le payload DOIT respecter les schémas Zod par eventType (T046).
// Aucun PII direct dans le payload — règle enforced par test invariant T063.

import type { AuditEntryId, ConseillerComplianceId } from '@cv/shared/conformite';

export const AUDIT_EVENT_TYPES = [
  'dossier.submitted',
  'dossier.approved',
  'dossier.refused',
  'certificat.renewed',
  'affiliation.added',
  'affiliation.deactivated',
  'status.changed_to_verified',
  'status.changed_to_suspended',
  'status.changed_to_revoked',
  'expiration.reminder_sent_60d',
  'expiration.reminder_sent_30d',
  'expiration.reminder_sent_7d',
  'expiration.auto_suspended',
  'permit.revoked_by_admin',
  'permit.cascade_applied',
  'erasure.requested',
  'erasure.completed',
  'admin.viewed_dossier',
  'admin.viewed_document',
] as const;
export type AuditEventType = (typeof AUDIT_EVENT_TYPES)[number];

export const ACTOR_ROLES = ['conseiller', 'admin', 'system'] as const;
export type ActorRole = (typeof ACTOR_ROLES)[number];

export interface AuditEntry {
  readonly id: AuditEntryId;
  readonly conseillerComplianceId: ConseillerComplianceId | null;
  readonly eventType: AuditEventType;
  readonly actorId: string | null;
  readonly actorRole: ActorRole;
  readonly payload: Record<string, unknown>; // schéma Zod par eventType — T046
  readonly occurredAt: Date;
  readonly idempotencyKey: string | null;
  readonly correlationId: string | null;
}
