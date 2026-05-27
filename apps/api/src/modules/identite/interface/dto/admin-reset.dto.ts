// DTOs HTTP pour le reset MFA admin (US4).

import { JustificationSchema, UuidV4Schema } from '@cv/mfa';
import { z } from 'zod';

export const AdminResetRequestSchema = z.object({
  targetUserId: UuidV4Schema,
  justification: JustificationSchema,
  idempotencyKey: UuidV4Schema,
});
export type AdminResetRequestDto = z.infer<typeof AdminResetRequestSchema>;

export interface AdminResetResponseDto {
  readonly resetAt: string;
  readonly sessionsRevokedCount: number;
  readonly warningDisplayedLastAdmin: boolean;
}

export interface ActiveAdminsCountResponseDto {
  readonly activeAdminsCount: number;
}
