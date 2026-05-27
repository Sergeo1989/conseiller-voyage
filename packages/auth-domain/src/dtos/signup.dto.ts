// T027 — DTO Zod signup (US1, FR-001/002/003).
//
// Validations synchrones pures (M5 — pas de .refine() async).
// La validation de l'email côté serveur passera par normalizeEmail()
// + lookup DB, pas par ce schema.

import { z } from 'zod';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '../password-policy';

export const SignupDtoSchema = z.object({
  email: z.string().email({ message: 'EMAIL_INVALID' }).max(254),
  password: z
    .string()
    .min(PASSWORD_MIN_LENGTH, { message: 'PASSWORD_TOO_SHORT' })
    .max(PASSWORD_MAX_LENGTH, { message: 'PASSWORD_TOO_LONG' }),
  firstName: z.string().min(2).max(50),
  lastName: z.string().min(2).max(50),
  acceptedTerms: z.literal(true, { errorMap: () => ({ message: 'TERMS_NOT_ACCEPTED' }) }),
  acceptedPrivacyPolicy: z.literal(true, {
    errorMap: () => ({ message: 'PRIVACY_POLICY_NOT_ACCEPTED' }),
  }),
});

export type SignupDto = z.infer<typeof SignupDtoSchema>;
