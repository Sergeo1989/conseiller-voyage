// Server Action — démarrage du flow auto-service device change (US6).

'use server';

import { randomUUID } from 'node:crypto';
import { auth } from '@/auth';
import { BackupCodeSchema, TotpCodeSchema, UuidV4Schema } from '@cv/mfa';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { mfaApiCall } from '../lib/api-fetch';

const DeviceChangeInputSchema = z.object({
  password: z.string().min(8),
  secondFactor: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('totp'), code: TotpCodeSchema }),
    z.object({ kind: z.literal('backup_code'), code: BackupCodeSchema }),
  ]),
});

export type StartDeviceChangeResult =
  | {
      kind: 'ok';
      qrCodeKeyUri: string;
      secretBase32: string;
      backupCodes: string[];
      enrollmentRequestId: string;
    }
  | { kind: 'invalid_credentials' }
  | { kind: 'invalid_second_factor' }
  | { kind: 'mfa_not_enrolled' }
  | { kind: 'error'; message: string };

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: dispatcher 5 cas + discriminated union
export async function startDeviceChangeAction(
  formData: FormData,
): Promise<StartDeviceChangeResult> {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const factorKind = String(formData.get('secondFactorKind') ?? '');
  const factorCode = String(formData.get('secondFactorCode') ?? '').toUpperCase();
  const factor =
    factorKind === 'totp'
      ? { kind: 'totp' as const, code: factorCode }
      : { kind: 'backup_code' as const, code: factorCode };

  const parsed = DeviceChangeInputSchema.safeParse({
    password: String(formData.get('password') ?? ''),
    secondFactor: factor,
  });
  if (!parsed.success) {
    return { kind: 'invalid_second_factor' };
  }

  const enrollmentRequestId = randomUUID();
  const { status, data } = await mfaApiCall('/api/mfa/change-device/start', {
    body: { ...parsed.data, enrollmentRequestId },
  });

  if (status === 200 && typeof data === 'object' && data !== null) {
    const parsedResp = z
      .object({
        secretBase32: z.string(),
        keyUri: z.string(),
        backupCodes: z.array(z.string()),
        enrollmentRequestId: UuidV4Schema,
      })
      .safeParse(data);
    if (parsedResp.success) {
      return {
        kind: 'ok',
        qrCodeKeyUri: parsedResp.data.keyUri,
        secretBase32: parsedResp.data.secretBase32,
        backupCodes: parsedResp.data.backupCodes,
        enrollmentRequestId: parsedResp.data.enrollmentRequestId,
      };
    }
  }
  if (status === 401) return { kind: 'invalid_credentials' };
  if (status === 400 && typeof data === 'object' && data !== null) {
    const code = String((data as { code?: unknown }).code ?? '');
    if (code === 'INVALID_SECOND_FACTOR') return { kind: 'invalid_second_factor' };
    if (code === 'MFA_NOT_ENROLLED') return { kind: 'mfa_not_enrolled' };
  }
  return { kind: 'error', message: `Unexpected status ${status}` };
}
