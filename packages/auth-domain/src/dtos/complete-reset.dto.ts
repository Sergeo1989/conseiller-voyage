// T030 — DTO Zod complete password reset (US5 endpoint 2).

import { z } from 'zod';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '../password-policy';

export const CompletePasswordResetDtoSchema = z.object({
  token: z.string().min(1, { message: 'TOKEN_REQUIRED' }),
  newPassword: z
    .string()
    .min(PASSWORD_MIN_LENGTH, { message: 'PASSWORD_TOO_SHORT' })
    .max(PASSWORD_MAX_LENGTH, { message: 'PASSWORD_TOO_LONG' }),
});

export type CompletePasswordResetDto = z.infer<typeof CompletePasswordResetDtoSchema>;
