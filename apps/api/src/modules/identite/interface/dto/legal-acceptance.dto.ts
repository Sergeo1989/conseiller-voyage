// T069 — DTOs et Zod validators pour l'acceptation CGU B2B (US3).
//
// Le payload est intentionnellement minimal — ipAddress et userAgent
// sont lus depuis la requête côté controller (pas confiés au client).

import { z } from 'zod';

export const AcceptCguB2bBodySchema = z.object({
  documentVersion: z.number().int().positive(),
});
export type AcceptCguB2bBody = z.infer<typeof AcceptCguB2bBodySchema>;

export const LegalVersionStatusResponseSchema = z.object({
  status: z.enum(['up_to_date', 'outdated', 'never_accepted']),
  currentVersion: z.number().int().positive(),
  acceptedVersion: z.number().int().positive().nullable(),
});
export type LegalVersionStatusResponse = z.infer<typeof LegalVersionStatusResponseSchema>;

export const AcceptCguB2bResponseSchema = z.object({
  status: z.literal('ok'),
  acceptanceId: z.string().uuid(),
  documentVersion: z.number().int().positive(),
  alreadyAccepted: z.boolean(),
});
export type AcceptCguB2bResponse = z.infer<typeof AcceptCguB2bResponseSchema>;
