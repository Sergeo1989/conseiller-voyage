// T031 — DTO Zod change password (US6).

import { z } from 'zod';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '../password-policy';

export const ChangePasswordDtoSchema = z
  .object({
    currentPassword: z.string().min(1, { message: 'CURRENT_PASSWORD_REQUIRED' }).max(128),
    newPassword: z
      .string()
      .min(PASSWORD_MIN_LENGTH, { message: 'PASSWORD_TOO_SHORT' })
      .max(PASSWORD_MAX_LENGTH, { message: 'PASSWORD_TOO_LONG' }),
    newPasswordConfirmation: z.string(),
  })
  .refine((data) => data.newPassword === data.newPasswordConfirmation, {
    message: 'PASSWORDS_DO_NOT_MATCH',
    path: ['newPasswordConfirmation'],
  });

export type ChangePasswordDto = z.infer<typeof ChangePasswordDtoSchema>;
