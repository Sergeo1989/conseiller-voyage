// T029 — DTO Zod request password reset (US5 endpoint 1).

import { z } from 'zod';

export const RequestPasswordResetDtoSchema = z.object({
  email: z.string().email({ message: 'EMAIL_INVALID' }).max(254),
});

export type RequestPasswordResetDto = z.infer<typeof RequestPasswordResetDtoSchema>;
