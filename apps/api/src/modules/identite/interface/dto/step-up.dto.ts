// DTOs HTTP pour le step-up (US2) et la vérification freshness côté
// client (P1-4 split /me).

import { IntendedActionSchema, TotpCodeSchema } from '@cv/mfa';
import { z } from 'zod';

export const StepUpRequestSchema = z.object({
  totpCode: TotpCodeSchema,
  intendedAction: IntendedActionSchema,
});
export type StepUpRequestDto = z.infer<typeof StepUpRequestSchema>;

export interface StepUpOkResponseDto {
  readonly kind: 'ok';
  readonly verifiedAt: string;
}
export interface StepUpInvalidResponseDto {
  readonly kind: 'invalid';
  readonly attemptsRemaining: number;
}
export type StepUpResponseDto = StepUpOkResponseDto | StepUpInvalidResponseDto;

export interface SessionFreshnessResponseDto {
  readonly fresh: boolean;
  readonly mfaVerifiedAt: string | null;
}
