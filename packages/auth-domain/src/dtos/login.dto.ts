// T028 — DTO Zod login (US2).

import { z } from 'zod';

export const LoginDtoSchema = z.object({
  email: z.string().email({ message: 'EMAIL_INVALID' }).max(254),
  password: z.string().min(1, { message: 'PASSWORD_REQUIRED' }).max(128),
});

export type LoginDto = z.infer<typeof LoginDtoSchema>;
