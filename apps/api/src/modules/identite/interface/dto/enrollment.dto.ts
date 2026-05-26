// DTOs HTTP pour le flow d'enrôlement TOTP.
// Schemas Zod partagés via @cv/mfa pour cohérence apps/api + apps/web.

import { TotpCodeSchema, UuidV4Schema } from '@cv/mfa';
import { z } from 'zod';

export const StartEnrollmentRequestSchema = z.object({
  enrollmentRequestId: UuidV4Schema,
});
export type StartEnrollmentRequestDto = z.infer<typeof StartEnrollmentRequestSchema>;

export interface StartEnrollmentResponseDto {
  readonly secretBase32: string;
  readonly keyUri: string;
  readonly backupCodes: string[];
  readonly enrollmentRequestId: string;
}

export const ConfirmEnrollmentRequestSchema = z.object({
  enrollmentRequestId: UuidV4Schema,
  totpCode: TotpCodeSchema,
  backupCodesAcknowledged: z.literal(true),
});
export type ConfirmEnrollmentRequestDto = z.infer<typeof ConfirmEnrollmentRequestSchema>;

export interface ConfirmEnrollmentResponseDto {
  readonly enabled: true;
  readonly enabledAt: string; // ISO 8601
}
