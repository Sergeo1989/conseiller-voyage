// T032 — DTOs Zod invitation admin (US7).

import { z } from 'zod';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '../password-policy';

// POST /admin/users — un admin invite un nouvel admin.
export const InviteAdminDtoSchema = z.object({
  targetEmail: z.string().email({ message: 'EMAIL_INVALID' }).max(254),
});

export type InviteAdminDto = z.infer<typeof InviteAdminDtoSchema>;

// POST /api/auth/admin-invitation/validate — pré-vérification du token.
export const ValidateAdminInvitationDtoSchema = z.object({
  token: z.string().min(1, { message: 'TOKEN_REQUIRED' }),
});

export type ValidateAdminInvitationDto = z.infer<typeof ValidateAdminInvitationDtoSchema>;

// POST /api/auth/admin-invitation/consume — l'invité accepte avec mot de passe.
export const ConsumeAdminInvitationDtoSchema = z.object({
  token: z.string().min(1, { message: 'TOKEN_REQUIRED' }),
  firstName: z.string().min(2).max(50),
  lastName: z.string().min(2).max(50),
  password: z
    .string()
    .min(PASSWORD_MIN_LENGTH, { message: 'PASSWORD_TOO_SHORT' })
    .max(PASSWORD_MAX_LENGTH, { message: 'PASSWORD_TOO_LONG' }),
  acceptedTerms: z.literal(true, { errorMap: () => ({ message: 'TERMS_NOT_ACCEPTED' }) }),
  acceptedPrivacyPolicy: z.literal(true, {
    errorMap: () => ({ message: 'PRIVACY_POLICY_NOT_ACCEPTED' }),
  }),
});

export type ConsumeAdminInvitationDto = z.infer<typeof ConsumeAdminInvitationDtoSchema>;
