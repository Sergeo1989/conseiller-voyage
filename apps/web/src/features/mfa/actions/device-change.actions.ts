// Server Actions US6 (auto-service device change + régénération codes).

'use server';

import { randomUUID } from 'node:crypto';
import { auth } from '@/auth';
import { BackupCodeSchema, TotpCodeSchema, UuidV4Schema } from '@cv/mfa';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

async function apiPost(
  path: string,
  body: object | null,
): Promise<{ status: number; data: unknown }> {
  const cookieHeader = (await cookies())
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join('; ');
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      Cookie: cookieHeader,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    cache: 'no-store',
  });
  const data = res.headers.get('content-type')?.includes('application/json')
    ? await res.json()
    : null;
  return { status: res.status, data };
}

// ---------------------------------------------------------------------
// startDeviceChangeAction
// ---------------------------------------------------------------------

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
  const { status, data } = await apiPost('/api/mfa/change-device/start', {
    ...parsed.data,
    enrollmentRequestId,
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

// ---------------------------------------------------------------------
// regenerateBackupCodesAction (step-up requis côté API)
// ---------------------------------------------------------------------

export type RegenerateBackupCodesResult =
  | { kind: 'ok'; backupCodes: string[] }
  | { kind: 'stepup_required' }
  | { kind: 'error'; message: string };

export async function regenerateBackupCodesAction(): Promise<RegenerateBackupCodesResult> {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const { status, data } = await apiPost('/api/mfa/regenerate-backup-codes', {});

  if (status === 200 && typeof data === 'object' && data !== null) {
    const codes = (data as { backupCodes?: unknown }).backupCodes;
    if (Array.isArray(codes)) {
      return { kind: 'ok', backupCodes: codes.map(String) };
    }
  }
  if (status === 403 && typeof data === 'object' && data !== null) {
    const code = String((data as { code?: unknown }).code ?? '');
    if (code === 'STEP_UP_REQUIRED') return { kind: 'stepup_required' };
  }
  return { kind: 'error', message: `Unexpected status ${status}` };
}
