// DTOs HTTP pour US6 (device change + regenerate codes).

import { BackupCodeSchema, TotpCodeSchema, UuidV4Schema } from '@cv/mfa';
import { z } from 'zod';

export const ChangeDeviceRequestSchema = z.object({
  password: z.string().min(8),
  secondFactor: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('totp'), code: TotpCodeSchema }),
    z.object({ kind: z.literal('backup_code'), code: BackupCodeSchema }),
  ]),
  enrollmentRequestId: UuidV4Schema,
});
export type ChangeDeviceRequestDto = z.infer<typeof ChangeDeviceRequestSchema>;

export interface ChangeDeviceResponseDto {
  readonly secretBase32: string;
  readonly keyUri: string;
  readonly backupCodes: string[];
  readonly enrollmentRequestId: string;
}

export interface RegenerateBackupCodesResponseDto {
  readonly backupCodes: string[];
}
