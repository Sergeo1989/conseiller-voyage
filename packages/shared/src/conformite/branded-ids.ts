// T027 — Identifiants UUID brandés du module conformité.
// Empêche les confusions entre IDs (ex: passer un CertificatId là où un
// ConseillerComplianceId est attendu) — le type strict TypeScript rejette
// l'erreur à la compilation.
// Cf. data-model.md *Value Objects*.

import { z } from 'zod';

const uuidSchema = z.string().uuid();

// --- Identifiants du module conformité ---

export const ConseillerComplianceIdSchema = uuidSchema.brand<'ConseillerComplianceId'>();
export type ConseillerComplianceId = z.infer<typeof ConseillerComplianceIdSchema>;

export const CertificatIdSchema = uuidSchema.brand<'CertificatId'>();
export type CertificatId = z.infer<typeof CertificatIdSchema>;

export const AffiliationIdSchema = uuidSchema.brand<'AffiliationId'>();
export type AffiliationId = z.infer<typeof AffiliationIdSchema>;

export const PermitRevocationIdSchema = uuidSchema.brand<'PermitRevocationId'>();
export type PermitRevocationId = z.infer<typeof PermitRevocationIdSchema>;

export const AuditEntryIdSchema = uuidSchema.brand<'AuditEntryId'>();
export type AuditEntryId = z.infer<typeof AuditEntryIdSchema>;

export const OutboxEntryIdSchema = uuidSchema.brand<'OutboxEntryId'>();
export type OutboxEntryId = z.infer<typeof OutboxEntryIdSchema>;

export const UploadIntentIdSchema = uuidSchema.brand<'UploadIntentId'>();
export type UploadIntentId = z.infer<typeof UploadIntentIdSchema>;

export const SubmissionIdSchema = uuidSchema.brand<'SubmissionId'>();
export type SubmissionId = z.infer<typeof SubmissionIdSchema>;

// --- Identifiants externes (clé étrangère vers module identité — T017) ---

export const ConseillerIdSchema = uuidSchema.brand<'ConseillerId'>();
export type ConseillerId = z.infer<typeof ConseillerIdSchema>;

export const AdminIdSchema = uuidSchema.brand<'AdminId'>();
export type AdminId = z.infer<typeof AdminIdSchema>;

// --- Helpers de test ---
// Aide à construire des IDs typés depuis des UUIDs littéraux dans les fixtures.

export function asConseillerComplianceId(uuid: string): ConseillerComplianceId {
  return ConseillerComplianceIdSchema.parse(uuid);
}

export function asConseillerId(uuid: string): ConseillerId {
  return ConseillerIdSchema.parse(uuid);
}

export function asAdminId(uuid: string): AdminId {
  return AdminIdSchema.parse(uuid);
}
