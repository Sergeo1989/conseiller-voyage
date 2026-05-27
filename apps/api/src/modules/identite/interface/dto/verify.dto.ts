// DTOs HTTP pour le flow de vérification au login (US3).

import { BackupCodeSchema, TotpCodeSchema } from '@cv/mfa';
import { z } from 'zod';

export const VerifyTotpRequestSchema = z.object({
  totpCode: TotpCodeSchema,
});
export type VerifyTotpRequestDto = z.infer<typeof VerifyTotpRequestSchema>;

export const VerifyBackupCodeRequestSchema = z.object({
  backupCode: BackupCodeSchema,
});
export type VerifyBackupCodeRequestDto = z.infer<typeof VerifyBackupCodeRequestSchema>;

export interface VerifyOkResponseDto {
  readonly kind: 'ok';
  readonly verifiedAt: string;
}
export interface VerifyInvalidResponseDto {
  readonly kind: 'invalid';
  readonly attemptsRemaining: number;
}
export interface VerifyBackupOkResponseDto extends VerifyOkResponseDto {
  readonly remainingCount: number;
  readonly warnLowCodes: boolean;
}
export type VerifyTotpResponseDto = VerifyOkResponseDto | VerifyInvalidResponseDto;
export type VerifyBackupCodeResponseDto = VerifyBackupOkResponseDto | VerifyInvalidResponseDto;
