// T010 — Branded IDs des leads (feature 012).
//
// Même pattern que `@cv/shared/matching/branded-ids` (011) : `z.brand<'X'>()`
// (le brand Zod sert aussi de brand TypeScript).

import { z } from 'zod';

const uuidSchema = z.string().uuid();

export const LeadIdSchema = uuidSchema.brand<'LeadId'>();
export type LeadId = z.infer<typeof LeadIdSchema>;

export const LeadTransitionIdSchema = uuidSchema.brand<'LeadTransitionId'>();
export type LeadTransitionId = z.infer<typeof LeadTransitionIdSchema>;

export const LeadNotificationIdSchema = uuidSchema.brand<'LeadNotificationId'>();
export type LeadNotificationId = z.infer<typeof LeadNotificationIdSchema>;

// ---------------------------------------------------------------------------
// Helpers — construction depuis littéraux (tests, seeds, parsing API)
// ---------------------------------------------------------------------------

export function asLeadId(uuid: string): LeadId {
  return LeadIdSchema.parse(uuid);
}

export function asLeadTransitionId(uuid: string): LeadTransitionId {
  return LeadTransitionIdSchema.parse(uuid);
}

export function asLeadNotificationId(uuid: string): LeadNotificationId {
  return LeadNotificationIdSchema.parse(uuid);
}
