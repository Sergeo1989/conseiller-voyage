// Server Action — vérification d'un code de secours au login (US3).
// Cf. specs/005-mfa-conseiller/contracts/server-actions.md § verifyBackupCodeAction.

'use server';

import { auth } from '@/auth';
import { BackupCodeSchema } from '@cv/mfa';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { mfaApiCall } from '../lib/api-fetch';

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

  const { status, data } = await mfaApiCall('/api/mfa/verify-backup-code', { body: parsed.data });

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
