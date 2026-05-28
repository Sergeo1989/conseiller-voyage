// T018 [TDD GREEN] — Identifiants UUID brandés du module intake.
// Empêche les confusions entre IDs (ex: passer un MagicLinkTokenId là où
// un VoyageurBriefId est attendu) — le type strict TypeScript rejette
// l'erreur à la compilation.
// Cf. data-model.md *Value Objects* + tests T017.

import { z } from 'zod';

const uuidSchema = z.string().uuid();

// --- Identifiants du module intake ---

export const VoyageurBriefIdSchema = uuidSchema.brand<'VoyageurBriefId'>();
export type VoyageurBriefId = z.infer<typeof VoyageurBriefIdSchema>;

export const VoyageurContactIdSchema = uuidSchema.brand<'VoyageurContactId'>();
export type VoyageurContactId = z.infer<typeof VoyageurContactIdSchema>;

export const MagicLinkTokenIdSchema = uuidSchema.brand<'MagicLinkTokenId'>();
export type MagicLinkTokenId = z.infer<typeof MagicLinkTokenIdSchema>;

export const IntakeAuditEntryIdSchema = uuidSchema.brand<'IntakeAuditEntryId'>();
export type IntakeAuditEntryId = z.infer<typeof IntakeAuditEntryIdSchema>;

export const IntakeOutboxEntryIdSchema = uuidSchema.brand<'IntakeOutboxEntryId'>();
export type IntakeOutboxEntryId = z.infer<typeof IntakeOutboxEntryIdSchema>;

// --- Helpers de test ---
// Aide à construire des IDs typés depuis des UUIDs littéraux dans les
// fixtures / tests / seeds. Lance ZodError si la valeur n'est pas un UUID v4.

export function asVoyageurBriefId(uuid: string): VoyageurBriefId {
  return VoyageurBriefIdSchema.parse(uuid);
}

export function asVoyageurContactId(uuid: string): VoyageurContactId {
  return VoyageurContactIdSchema.parse(uuid);
}

export function asMagicLinkTokenId(uuid: string): MagicLinkTokenId {
  return MagicLinkTokenIdSchema.parse(uuid);
}

export function asIntakeAuditEntryId(uuid: string): IntakeAuditEntryId {
  return IntakeAuditEntryIdSchema.parse(uuid);
}

export function asIntakeOutboxEntryId(uuid: string): IntakeOutboxEntryId {
  return IntakeOutboxEntryIdSchema.parse(uuid);
}
