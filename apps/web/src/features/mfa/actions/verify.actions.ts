// Server Actions du flow de vérification au login (US3).
//
// Cf. specs/005-mfa-conseiller/contracts/server-actions.md
// § verifyTotpAction + verifyBackupCodeAction.

'use server';

import { auth } from '@/auth';
import { BackupCodeSchema, TotpCodeSchema } from '@cv/mfa';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

async function apiPost(path: string, body: object): Promise<{ status: number; data: unknown }> {
  const cookieHeader = (await cookies())
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join('; ');
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  const data = res.headers.get('content-type')?.includes('application/json')
    ? await res.json()
    : null;
  return { status: res.status, data };
}

// ---------------------------------------------------------------------
// verifyTotpAction
// ---------------------------------------------------------------------

const VerifyTotpInputSchema = z.object({
  totpCode: TotpCodeSchema,
});

export type VerifyTotpActionResult =
  | { kind: 'ok' }
  | { kind: 'invalid'; attemptsRemaining: number }
  | { kind: 'locked'; unlockAt: string }
  | { kind: 'error'; message: string };

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: dispatcher de réponse API typé sur 4 cas
export async function verifyTotpAction(formData: FormData): Promise<VerifyTotpActionResult> {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const parsed = VerifyTotpInputSchema.safeParse({ totpCode: formData.get('totpCode') });
  if (!parsed.success) return { kind: 'invalid', attemptsRemaining: 5 };

  const { status, data } = await apiPost('/api/mfa/verify', parsed.data);

  if (status === 200 && typeof data === 'object' && data !== null && 'kind' in data) {
    const kind = (data as { kind: unknown }).kind;
    if (kind === 'ok') return { kind: 'ok' };
    if (kind === 'invalid') {
      const remaining =
        'attemptsRemaining' in data
          ? Number((data as { attemptsRemaining: unknown }).attemptsRemaining)
          : 0;
      return { kind: 'invalid', attemptsRemaining: remaining };
    }
  }
  if (status === 429 && typeof data === 'object' && data !== null && 'unlockAt' in data) {
    return { kind: 'locked', unlockAt: String((data as { unlockAt: unknown }).unlockAt) };
  }
  return { kind: 'error', message: `Unexpected status ${status}` };
}

// ---------------------------------------------------------------------
// verifyBackupCodeAction
// ---------------------------------------------------------------------

const VerifyBackupCodeInputSchema = z.object({
  backupCode: BackupCodeSchema,
});

export type VerifyBackupCodeActionResult =
  | { kind: 'ok'; remainingCount: number; warnLowCodes: boolean }
  | { kind: 'invalid'; attemptsRemaining: number }
  | { kind: 'locked'; unlockAt: string }
  | { kind: 'error'; message: string };

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: dispatcher de réponse API typé sur 4 cas + warnLow
export async function verifyBackupCodeAction(
  formData: FormData,
): Promise<VerifyBackupCodeActionResult> {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const rawBackup = String(formData.get('backupCode') ?? '').toUpperCase();
  const parsed = VerifyBackupCodeInputSchema.safeParse({ backupCode: rawBackup });
  if (!parsed.success) return { kind: 'invalid', attemptsRemaining: 5 };

  const { status, data } = await apiPost('/api/mfa/verify-backup-code', parsed.data);

  if (status === 200 && typeof data === 'object' && data !== null && 'kind' in data) {
    const kind = (data as { kind: unknown }).kind;
    if (kind === 'ok') {
      return {
        kind: 'ok',
        remainingCount: Number((data as { remainingCount?: unknown }).remainingCount ?? 0),
        warnLowCodes: Boolean((data as { warnLowCodes?: unknown }).warnLowCodes),
      };
    }
    if (kind === 'invalid') {
      const remaining =
        'attemptsRemaining' in data
          ? Number((data as { attemptsRemaining: unknown }).attemptsRemaining)
          : 0;
      return { kind: 'invalid', attemptsRemaining: remaining };
    }
  }
  if (status === 429 && typeof data === 'object' && data !== null && 'unlockAt' in data) {
    return { kind: 'locked', unlockAt: String((data as { unlockAt: unknown }).unlockAt) };
  }
  return { kind: 'error', message: `Unexpected status ${status}` };
}
