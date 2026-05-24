// T046 — Schémas Zod par eventType pour le payload des entrées d'audit.
// B5 du review : aucun PII direct, uniquement références par UUID +
// énumérations + horodatages + compteurs. Cf. research.md R10 et
// data-model.md *Règles de pseudonymisation*.
//
// Toutes les définitions utilisent `.strict()` pour rejeter toute clé
// non listée (défense en profondeur contre l'introduction accidentelle
// de PII par un copier-coller futur).

import { z } from 'zod';
import { AUDIT_EVENT_TYPES, type AuditEventType } from '../../domain/entities/audit-entry.entity';
import { STATUS_TRANSITION_CAUSES } from '../../domain/events/conformite-status-changed.event';
import { CONFORMITE_STATUSES } from '../../domain/value-objects/conformite-status.vo';
import { PROVINCES } from '../../domain/value-objects/province.vo';

// --- Schémas de payload par eventType ---

const StatusChangedPayload = z
  .object({
    previousStatus: z.enum(CONFORMITE_STATUSES),
    newStatus: z.enum(CONFORMITE_STATUSES),
    cause: z.enum(STATUS_TRANSITION_CAUSES),
  })
  .strict();

const DossierSubmittedPayload = z
  .object({
    submissionId: z.string().uuid(),
    certificateCount: z.number().int().nonnegative(),
    affiliationCount: z.number().int().nonnegative(),
  })
  .strict();

const DossierApprovedPayload = z
  .object({
    submissionId: z.string().uuid(),
    /** Longueur du commentaire admin (le contenu reste en colonne décidée). */
    commentLength: z.number().int().nonnegative().optional(),
  })
  .strict();

const DossierRefusedPayload = z
  .object({
    submissionId: z.string().uuid(),
    /** Longueur du motif (≥ 20 chars FR-004). Contenu en colonne séparée
     *  pour conformité R10 (pas de texte libre dans audit). */
    reasonLength: z.number().int().min(20),
  })
  .strict();

const CertificatRenewedPayload = z
  .object({
    previousCertificateId: z.string().uuid(),
    newCertificateId: z.string().uuid(),
    province: z.enum(PROVINCES),
  })
  .strict();

const AffiliationAddedPayload = z
  .object({
    affiliationId: z.string().uuid(),
    agencyPermitNumber: z.string(),
    agencyProvince: z.enum(PROVINCES),
  })
  .strict();

const AffiliationDeactivatedPayload = z
  .object({
    affiliationId: z.string().uuid(),
    reason: z.enum(['conseiller', 'permit_revocation', 'admin']),
  })
  .strict();

const ExpirationReminderPayload = z
  .object({
    certificateId: z.string().uuid(),
    expiresAt: z.string().datetime(),
  })
  .strict();

const ExpirationAutoSuspendedPayload = z
  .object({
    expiredCertificateIds: z.array(z.string().uuid()).min(1),
  })
  .strict();

const PermitRevokedByAdminPayload = z
  .object({
    permitRevocationId: z.string().uuid(),
    agencyPermitNumber: z.string(),
    agencyProvince: z.enum(PROVINCES),
    affectedConseillerCount: z.number().int().nonnegative(),
  })
  .strict();

const PermitCascadeAppliedPayload = z
  .object({
    permitRevocationId: z.string().uuid(),
    affiliationId: z.string().uuid(),
  })
  .strict();

const ErasurePayload = z
  .object({
    requestedAt: z.string().datetime(),
  })
  .strict();

const AdminViewedPayload = z
  .object({
    /** Référence à ce qui a été consulté — UUID, jamais le contenu. */
    targetId: z.string().uuid(),
  })
  .strict();

// --- Table de routage eventType → schéma ---

export const AUDIT_PAYLOAD_SCHEMAS: Record<AuditEventType, z.ZodTypeAny> = {
  'dossier.submitted': DossierSubmittedPayload,
  'dossier.approved': DossierApprovedPayload,
  'dossier.refused': DossierRefusedPayload,
  'certificat.renewed': CertificatRenewedPayload,
  'affiliation.added': AffiliationAddedPayload,
  'affiliation.deactivated': AffiliationDeactivatedPayload,
  'status.changed_to_verified': StatusChangedPayload,
  'status.changed_to_suspended': StatusChangedPayload,
  'status.changed_to_revoked': StatusChangedPayload,
  'expiration.reminder_sent_60d': ExpirationReminderPayload,
  'expiration.reminder_sent_30d': ExpirationReminderPayload,
  'expiration.reminder_sent_7d': ExpirationReminderPayload,
  'expiration.auto_suspended': ExpirationAutoSuspendedPayload,
  'permit.revoked_by_admin': PermitRevokedByAdminPayload,
  'permit.cascade_applied': PermitCascadeAppliedPayload,
  'erasure.requested': ErasurePayload,
  'erasure.completed': ErasurePayload,
  'admin.viewed_dossier': AdminViewedPayload,
  'admin.viewed_document': AdminViewedPayload,
};

/** Lève si le payload ne correspond pas au schéma de l'eventType. */
export function validateAuditPayload(eventType: AuditEventType, payload: unknown): void {
  const schema = AUDIT_PAYLOAD_SCHEMAS[eventType];
  if (!schema) {
    throw new Error(`No audit payload schema registered for eventType "${eventType}"`);
  }
  schema.parse(payload);
}

/** Sanity check au boot : toutes les valeurs d'AUDIT_EVENT_TYPES ont un schéma. */
export function assertAllEventTypesCovered(): void {
  for (const eventType of AUDIT_EVENT_TYPES) {
    if (!AUDIT_PAYLOAD_SCHEMAS[eventType]) {
      throw new Error(`Missing audit payload schema for eventType "${eventType}"`);
    }
  }
}
